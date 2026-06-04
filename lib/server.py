"""HTTP server for the generated catalog and local control actions.

This module provides a threaded HTTP server that serves the generated HTML catalog,
PDF files, and local control endpoints for managing the server and interacting
with the web interface.
"""
import json
import os
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Lock, Thread
from urllib.parse import unquote, urlsplit

from lib import control_api, tag_api
from lib.range_server import handle_range_request
from lib.security import check_control_request
from lib.utils import safe_join


@dataclass
class ServerContext:
    """Context object for the HTTP server containing all necessary state.

    Attributes:
        pdf_root: Root directory containing PDF files.
        work_dir: Work directory for tools and temporary files.
        output_dir: Directory containing generated HTML and assets.
        state: Shared state dictionary with allowed paths.
        shutdown_token: Token for authenticating shutdown requests.
        base_url: Base URL for the HTTP server.
        range_support: Whether HTTP Range requests are supported.
        shutdown_requested: Event to signal server shutdown.
        refresh_lock: Lock for thread-safe catalog refresh.
    """
    pdf_root: Path
    work_dir: Path
    output_dir: Path
    state: dict
    shutdown_token: str
    base_url: str
    range_support: bool
    shutdown_requested: Event
    refresh_lock: Lock


def start_http_server(
    pdf_root,
    output_dir,
    host,
    port,
    state,
    shutdown_token,
    base_url,
    range_support=True,
    work_dir=None,
):
    """Start the HTTP server for serving catalog and control endpoints.

    Args:
        pdf_root: Root directory containing PDF files.
        output_dir: Directory containing generated HTML and assets.
        host: Host address to bind the server to.
        port: Port number for the server.
        state: Shared state dictionary with allowed paths.
        shutdown_token: Token for authenticating shutdown requests.
        base_url: Base URL for the HTTP server.
        range_support: Whether HTTP Range requests are supported.
        work_dir: Work directory path for tools.

    Returns:
        ThreadingHTTPServer: The running server instance.
    """
    ctx = ServerContext(
        pdf_root=Path(pdf_root).resolve(),
        work_dir=Path(work_dir).resolve() if work_dir else Path(pdf_root).resolve(),
        output_dir=Path(output_dir).resolve(),
        state=state,
        shutdown_token=shutdown_token,
        base_url=base_url,
        range_support=range_support,
        shutdown_requested=Event(),
        refresh_lock=Lock(),
    )

    routes = {
        "/__shutdown": control_api.handle_shutdown,
        "/__refresh": control_api.handle_refresh,
        "/__open_native": control_api.handle_open_native,
        "/__tool_run": control_api.handle_tool_run,
        "/__tool_open": control_api.handle_tool_open,
        "/__restart": control_api.handle_restart,
        "/__tags_get": tag_api.handle_tags_get,
        "/__tag_update": tag_api.handle_tag_update,
        "/__tag_rename": tag_api.handle_tag_rename,
        "/__tag_delete": tag_api.handle_tag_delete,
    }

    class CatalogHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ctx.pdf_root), **kwargs)

        def check_control_request(self):
            return check_control_request(self, ctx.shutdown_token)

        def send_json(self, status, data):
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def read_json_body(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > 65536:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))

        def do_GET(self):
            if self._try_range_request("GET"):
                return
            return super().do_GET()

        def do_HEAD(self):
            if self._try_range_request("HEAD"):
                return
            return super().do_HEAD()

        def _try_range_request(self, method):
            range_header = self.headers.get("Range")
            if not range_header or not ctx.range_support:
                return False
            try:
                path = self.translate_path(self.path)
                if os.path.isfile(path):
                    handle_range_request(self, path, range_header, method=method)
                    return True
            except Exception:
                return False
            return False

        def do_POST(self):
            request_path = urlsplit(self.path).path
            handler = routes.get(request_path)
            if handler:
                handler(self, ctx)
                return
            self.send_error(404)

        def translate_path(self, path):
            request_path = unquote(urlsplit(path).path, errors="surrogatepass")
            rel = request_path.lstrip("/")

            with ctx.state["lock"]:
                allowed_output_paths = set(ctx.state["allowed_output_paths"])
                allowed_pdf_paths = set(ctx.state["allowed_pdf_paths"])

            if rel.startswith("output/"):
                output_rel = rel.split("/", 1)[1]
                if output_rel in allowed_output_paths:
                    return safe_join(ctx.output_dir, output_rel)
                return safe_join(ctx.output_dir, "__not_allowed__")
            if rel in allowed_output_paths:
                return safe_join(ctx.output_dir, rel)
            if rel in allowed_pdf_paths:
                return safe_join(ctx.pdf_root, rel)
            return safe_join(ctx.pdf_root, "__not_allowed__")

        def list_directory(self, path):
            self.send_error(403, "directory listing is disabled")
            return None

        def log_message(self, fmt, *args):
            print(f"  [HTTP] {unquote(fmt % args)}")

    server = ThreadingHTTPServer((host, port), CatalogHandler)
    server.shutdown_requested = ctx.shutdown_requested
    Thread(target=server.serve_forever, daemon=True).start()
    return server

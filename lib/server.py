"""HTTP server for the generated catalog and local control actions.

This module provides a threaded HTTP server that serves the generated HTML catalog,
PDF files, and local control endpoints for managing the server and interacting
with the web interface.
"""
import json
import logging
import os
from dataclasses import dataclass, field
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Lock, Thread
from typing import Callable
from urllib.parse import unquote, urlsplit

from lib import control_api
from lib.range_server import handle_range_request
from lib.security import check_control_request
from lib.utils import safe_join

log = logging.getLogger(__name__)


class ServerState:
    """Thread-safe container for allowed path sets.

    Replaces the raw dict+Lock pattern with explicit accessor methods,
    so callers cannot forget to acquire the lock.
    """

    def __init__(self, allowed_pdf_paths, allowed_output_paths):
        self._lock = Lock()
        self._allowed_pdf_paths = set(allowed_pdf_paths)
        self._allowed_output_paths = set(allowed_output_paths)

    def get_allowed_paths(self):
        """Return a snapshot of (output_paths, pdf_paths)."""
        with self._lock:
            return set(self._allowed_output_paths), set(self._allowed_pdf_paths)

    def update_paths(self, allowed_pdf_paths, allowed_output_paths):
        """Replace both path sets atomically."""
        with self._lock:
            self._allowed_pdf_paths = set(allowed_pdf_paths)
            self._allowed_output_paths = set(allowed_output_paths)


@dataclass
class ServerContext:
    """Context object for the HTTP server containing all necessary state.

    Attributes:
        pdf_root: Root directory containing PDF files.
        output_dir: Directory containing generated HTML and assets.
        state: Thread-safe allowed path sets.
        shutdown_token: Token for authenticating shutdown requests.
        base_url: Base URL for the HTTP server.
        range_support: Whether HTTP Range requests are supported.
        shutdown_requested: Event to signal server shutdown.
        refresh_lock: Lock for thread-safe catalog refresh.
        rebuild_fn: Callable that rebuilds the catalog and returns result dict.
    """
    pdf_root: Path
    output_dir: Path
    state: ServerState
    shutdown_token: str
    base_url: str
    range_support: bool
    shutdown_requested: Event
    refresh_lock: Lock
    rebuild_fn: Callable = field(default=lambda: None)


def start_http_server(
    pdf_root,
    output_dir,
    host,
    port,
    state,
    shutdown_token,
    base_url,
    range_support=True,
    rebuild_fn=None,
):
    """Start the HTTP server for serving catalog and control endpoints.

    Args:
        pdf_root: Root directory containing PDF files.
        output_dir: Directory containing generated HTML and assets.
        host: Host address to bind the server to.
        port: Port number for the server.
        state: ServerState instance with allowed paths.
        shutdown_token: Token for authenticating shutdown requests.
        base_url: Base URL for the HTTP server.
        range_support: Whether HTTP Range requests are supported.
        rebuild_fn: Callable that rebuilds the catalog.

    Returns:
        ThreadingHTTPServer: The running server instance.
    """
    ctx = ServerContext(
        pdf_root=Path(pdf_root).resolve(),
        output_dir=Path(output_dir).resolve(),
        state=state,
        shutdown_token=shutdown_token,
        base_url=base_url,
        range_support=range_support,
        shutdown_requested=Event(),
        refresh_lock=Lock(),
        rebuild_fn=rebuild_fn or (lambda: None),
    )

    routes = {
        "/__shutdown": control_api.handle_shutdown,
        "/__refresh": control_api.handle_refresh,
        "/__open_native": control_api.handle_open_native,
        "/__open_root": control_api.handle_open_root,
        "/__restart": control_api.handle_restart,
    }

    handler_class = make_handler_class(ctx, routes)
    server = ThreadingHTTPServer((host, port), handler_class)
    server.shutdown_requested = ctx.shutdown_requested
    Thread(target=server.serve_forever, daemon=True).start()
    return server


def make_handler_class(ctx, routes):
    """Create a CatalogHandler class bound to the given context and routes.

    Extracted from start_http_server to allow testing without starting a real server.
    """

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

        def end_headers(self):
            if ctx.range_support and self.command in ("GET", "HEAD"):
                self.send_header("Accept-Ranges", "bytes")
            super().end_headers()

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

            allowed_output_paths, allowed_pdf_paths = ctx.state.get_allowed_paths()

            try:
                if rel.startswith("output/"):
                    output_rel = rel.split("/", 1)[1]
                    if output_rel in allowed_output_paths:
                        return safe_join(ctx.output_dir, output_rel)
                    return str(ctx.output_dir / "_denied")
                if rel in allowed_output_paths:
                    return safe_join(ctx.output_dir, rel)
                if rel in allowed_pdf_paths:
                    return safe_join(ctx.pdf_root, rel)
            except ValueError:
                return str(ctx.output_dir / "_denied")
            return str(ctx.output_dir / "_denied")

        def list_directory(self, path):
            self.send_error(403, "directory listing is disabled")
            return None

        def log_message(self, fmt, *args):
            log.debug("[HTTP] %s", unquote(fmt % args))

    return CatalogHandler

"""HTTP server for the generated catalog and local control actions."""
import json
import os
import secrets
import subprocess
import sys
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Lock, Thread
from urllib.parse import unquote, urlsplit

from lib.builder import format_stats, rebuild_catalog
from lib.tool_runner import build_tool_command, open_path, resolve_child_dir
from lib.utils import safe_join


def _normalize_pdf_request_path(value):
    rel = unquote(str(value or ""), errors="surrogatepass")
    rel = urlsplit(rel).path
    while rel.startswith("../"):
        rel = rel[3:]
    return rel.lstrip("/")


def start_http_server(pdf_root, output_dir, host, port, state, shutdown_token, base_url):
    """Serve catalog assets, indexed PDFs, and local control endpoints."""
    shutdown_requested = Event()
    refresh_lock = Lock()

    class CatalogHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(pdf_root), **kwargs)

        def check_control_request(self):
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self.send_json(403, {"ok": False, "message": "control actions are only allowed from localhost"})
                return False
            token = self.headers.get("X-ComicReader-Token", "")
            if not secrets.compare_digest(token, shutdown_token):
                self.send_json(403, {"ok": False, "message": "invalid control token"})
                return False
            return True

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
            if length <= 0 or length > 4096:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))

        def do_GET(self):
            return super().do_GET()

        def do_POST(self):
            request_path = urlsplit(self.path).path

            if request_path == "/__shutdown":
                self.handle_shutdown()
                return
            if request_path == "/__refresh":
                self.handle_refresh()
                return
            if request_path == "/__open_native":
                self.handle_open_native()
                return
            if request_path == "/__tool_run":
                self.handle_tool_run()
                return
            if request_path == "/__tool_open":
                self.handle_tool_open()
                return
            if request_path == "/__restart":
                self.handle_restart()
                return

            self.send_error(404)

        def handle_shutdown(self):
            if not self.check_control_request():
                return
            self.send_json(200, {"ok": True, "message": "server shutting down"})
            shutdown_requested.set()
            Thread(target=self.server.shutdown, daemon=True).start()

        def handle_refresh(self):
            if not self.check_control_request():
                return
            if not refresh_lock.acquire(blocking=False):
                self.send_json(409, {"ok": False, "message": "refresh already running"})
                return
            try:
                result = rebuild_catalog(
                    pdf_root,
                    output_dir,
                    base_url=base_url,
                    shutdown_token=shutdown_token,
                    allow_empty=True,
                )
                with state["lock"]:
                    state["allowed_pdf_paths"] = result["allowed_pdf_paths"]
                    state["allowed_output_paths"] = result["allowed_output_paths"]
                self.send_json(200, {"ok": True, "stats": result["stats"]})
                print(f"  [REFRESH] {format_stats(result['stats'])}", flush=True)
            except Exception as exc:
                self.send_json(500, {"ok": False, "message": str(exc)})
                print(f"  [REFRESH] 错误: {exc}", flush=True)
                print(f"  [REFRESH] 详情:\n{traceback.format_exc()}", flush=True)
            finally:
                refresh_lock.release()

        def handle_open_native(self):
            if not self.check_control_request():
                return
            if sys.platform != "darwin":
                self.send_json(501, {"ok": False, "message": "Preview is only available on macOS"})
                return
            try:
                body = self.read_json_body()
                rel = _normalize_pdf_request_path(body.get("pdf", ""))
            except Exception:
                self.send_json(400, {"ok": False, "message": "invalid request body"})
                return
            with state["lock"]:
                allowed_pdf_paths = set(state["allowed_pdf_paths"])
            if rel not in allowed_pdf_paths:
                self.send_json(403, {"ok": False, "message": "pdf is not indexed"})
                return
            file_path = Path(safe_join(pdf_root, rel))
            if not file_path.is_file():
                self.send_json(404, {"ok": False, "message": "file not found"})
                return
            try:
                subprocess.Popen(["open", "-a", "Preview", str(file_path)])
                self.send_json(200, {"ok": True})
                print(f"  [OPEN] Preview: {rel}", flush=True)
            except Exception as exc:
                self.send_json(500, {"ok": False, "message": str(exc)})
                print(f"  [OPEN] 错误: {exc}", flush=True)

        def handle_tool_run(self):
            if not self.check_control_request():
                return
            try:
                body = self.read_json_body()
                root_dir = Path(self.directory).resolve()
                target_dir = resolve_child_dir(root_dir, body.get("folder", "."), allow_temp=True)
                cmd = build_tool_command(body.get("tool", ""), target_dir, body.get("params", {}))
            except ValueError as exc:
                self.send_json(400, {"ok": False, "message": str(exc)})
                return
            except FileNotFoundError as exc:
                self.send_json(400, {"ok": False, "message": str(exc)})
                return
            except Exception:
                self.send_json(400, {"ok": False, "message": "invalid request body"})
                return

            print(f"  [TOOL] {' '.join(cmd)}", flush=True)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()

            returncode = -1
            try:
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    bufsize=1,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
                for raw_line in process.stdout:
                    line = raw_line.rstrip("\r\n")
                    if line:
                        try:
                            self.wfile.write(f"data: {line}\n\n".encode("utf-8"))
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            break
                process.wait()
                returncode = process.returncode
            except Exception as exc:
                print(f"  [TOOL] 错误: {exc}", flush=True)

            try:
                final = json.dumps({"ok": returncode == 0, "returncode": returncode})
                self.wfile.write(f"data: __RESULT__:{final}\n\n".encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            self.close_connection = True
            print(f"  [TOOL] done (rc={returncode})", flush=True)

        def handle_tool_open(self):
            if not self.check_control_request():
                return
            try:
                body = self.read_json_body()
                target_dir = resolve_child_dir(Path(self.directory).resolve(), body.get("folder", "."))
                open_path(target_dir)
                self.send_json(200, {"ok": True})
                print(f"  [OPEN] {target_dir}", flush=True)
            except ValueError as exc:
                self.send_json(403, {"ok": False, "message": str(exc)})
            except FileNotFoundError as exc:
                self.send_json(400, {"ok": False, "message": str(exc)})
            except Exception as exc:
                self.send_json(500, {"ok": False, "message": str(exc)})

        def handle_restart(self):
            if not self.check_control_request():
                return
            self.send_json(200, {"ok": True, "message": "restarting..."})
            print("  [RESTART] 正在重启服务...", flush=True)

            def _restart():
                time.sleep(0.3)
                try:
                    self.server.shutdown()
                except Exception:
                    pass
                if sys.platform == "win32":
                    env = os.environ.copy()
                    env["COMICREAD_NO_BROWSER_OPEN"] = "1"
                    subprocess.Popen(
                        [sys.executable] + sys.argv,
                        env=env,
                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                    )
                    shutdown_requested.set()
                else:
                    os.environ["COMICREAD_NO_BROWSER_OPEN"] = "1"
                    os.execv(sys.executable, [sys.executable] + sys.argv)

            Thread(target=_restart, daemon=True).start()

        def translate_path(self, path):
            request_path = unquote(urlsplit(path).path, errors="surrogatepass")
            rel = request_path.lstrip("/")

            with state["lock"]:
                allowed_output_paths = set(state["allowed_output_paths"])
                allowed_pdf_paths = set(state["allowed_pdf_paths"])

            if rel.startswith("output/"):
                output_rel = rel.split("/", 1)[1]
                if output_rel in allowed_output_paths:
                    return safe_join(output_dir, output_rel)
                return safe_join(output_dir, "__not_allowed__")
            if rel in allowed_output_paths:
                return safe_join(output_dir, rel)
            if rel in allowed_pdf_paths:
                return safe_join(pdf_root, rel)
            return safe_join(pdf_root, "__not_allowed__")

        def list_directory(self, path):
            self.send_error(403, "directory listing is disabled")
            return None

        def log_message(self, fmt, *args):
            print(f"  [HTTP] {unquote(fmt % args)}")

    server = ThreadingHTTPServer((host, port), CatalogHandler)
    server.shutdown_requested = shutdown_requested
    Thread(target=server.serve_forever, daemon=True).start()
    return server

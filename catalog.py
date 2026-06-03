#!/usr/bin/env python3
"""Nocturne Manga — PDF catalog server and CLI entry point."""
import argparse
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Lock, Thread
from urllib.parse import unquote, urlsplit

# Cross-platform stdout/stderr configuration
try:
    sys.stdout.reconfigure(line_buffering=True, write_through=True)
    sys.stderr.reconfigure(line_buffering=True, write_through=True)
except AttributeError:
    pass

from lib.builder import rebuild_catalog, format_stats
from lib.config import HTML_FILE, PROJECT_ROOT
from lib.utils import safe_join


# =====================================================
# HTTP Server
# =====================================================


def start_http_server(pdf_root, output_dir, host, port, state, shutdown_token, base_url):
    """HTTP 服务: /output/* 映射到缓存目录, 其它路径映射到 PDF 根目录。"""
    shutdown_requested = Event()
    refresh_lock = Lock()

    class CatalogHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(pdf_root), **kwargs)

        def check_control_request(self):
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self.send_error(403, "control actions are only allowed from localhost")
                return False
            token = self.headers.get("X-ComicReader-Token", "")
            if not secrets.compare_digest(token, shutdown_token):
                self.send_error(403, "invalid control token")
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

        def normalize_pdf_request_path(self, value):
            rel = unquote(str(value or ""), errors="surrogatepass")
            rel = urlsplit(rel).path
            while rel.startswith("../"):
                rel = rel[3:]
            return rel.lstrip("/")

        def do_GET(self):
            return super().do_GET()

        def do_POST(self):
            request_path = urlsplit(self.path).path

            if request_path == "/__shutdown":
                if not self.check_control_request():
                    return
                self.send_json(200, {"ok": True, "message": "server shutting down"})
                shutdown_requested.set()
                Thread(target=self.server.shutdown, daemon=True).start()
                return

            if request_path == "/__refresh":
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
                    import traceback
                    tb = traceback.format_exc()
                    self.send_json(500, {"ok": False, "message": str(exc)})
                    print(f"  [REFRESH] 错误: {exc}", flush=True)
                    print(f"  [REFRESH] 详情:\n{tb}", flush=True)
                finally:
                    refresh_lock.release()
                return

            if request_path == "/__open_native":
                if not self.check_control_request():
                    return
                if sys.platform != "darwin":
                    self.send_json(501, {"ok": False, "message": "Preview is only available on macOS"})
                    return
                try:
                    body = self.read_json_body()
                    rel = self.normalize_pdf_request_path(body.get("pdf", ""))
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
                return

            if request_path == "/__tool_run":
                if not self.check_control_request():
                    return
                try:
                    body = self.read_json_body()
                except Exception:
                    self.send_json(400, {"ok": False, "message": "invalid request body"})
                    return

                tool = body.get("tool", "")
                folder_rel = body.get("folder", ".")
                params = body.get("params", {})

                if tool not in ("x", "y", "z"):
                    self.send_json(400, {"ok": False, "message": f"unknown tool: {tool}"})
                    return

                script_path = PROJECT_ROOT / "script" / f"{tool}.py"
                if not script_path.is_file():
                    self.send_json(500, {"ok": False, "message": f"script not found: {script_path}"})
                    return

                root_dir = Path(self.directory).resolve()
                target_dir = (root_dir / folder_rel).resolve()
                try:
                    target_dir.relative_to(root_dir)
                except ValueError:
                    self.send_json(403, {"ok": False, "message": "folder must be inside PDF root"})
                    return

                if not target_dir.is_dir():
                    if target_dir.name == "temp" and target_dir.parent == root_dir:
                        target_dir.mkdir(parents=True, exist_ok=True)
                        print(f"  [TOOL] 已创建临时目录: {target_dir}", flush=True)
                    else:
                        self.send_json(400, {"ok": False, "message": f"directory not found: {target_dir}"})
                        return

                cmd = [sys.executable, str(script_path), str(target_dir)]

                if tool == "x":
                    if params.get("strip"):
                        cmd.append("-s")
                    if params.get("width"):
                        cmd.extend(["-w", str(params["width"])])
                    if params.get("height"):
                        cmd.extend(["--height", str(params["height"])])
                elif tool == "y":
                    if not params.get("clean"):
                        single = params.get("single")
                        rng = params.get("range")
                        if isinstance(single, int) and single > 0:
                            cmd.extend(["-s", str(single)])
                        elif isinstance(rng, int) and rng > 0:
                            cmd.extend(["-r", str(rng)])
                        else:
                            self.send_json(400, {"ok": False, "message": "y.py requires single or range param"})
                            return
                        if params.get("back"):
                            cmd.append("-b")

                if params.get("clean"):
                    cmd.append("--clean")
                if params.get("open_after"):
                    cmd.append("--open")

                print(f"  [TOOL] {' '.join(cmd)}", flush=True)

                # 流式 SSE 输出
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()

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
                except Exception:
                    returncode = -1

                try:
                    final = json.dumps({"ok": returncode == 0, "returncode": returncode})
                    self.wfile.write(f"data: __RESULT__:{final}\n\n".encode("utf-8"))
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                self.close_connection = True
                print(f"  [TOOL] done (rc={returncode})", flush=True)
                return

            if request_path == "/__tool_open":
                if not self.check_control_request():
                    return
                try:
                    body = self.read_json_body()
                    folder_rel = body.get("folder", ".")
                except Exception:
                    self.send_json(400, {"ok": False, "message": "invalid request body"})
                    return
                root_dir = Path(self.directory).resolve()
                target_dir = (root_dir / folder_rel).resolve()
                try:
                    target_dir.relative_to(root_dir)
                except ValueError:
                    self.send_json(403, {"ok": False, "message": "folder must be inside PDF root"})
                    return
                if not target_dir.is_dir():
                    self.send_json(400, {"ok": False, "message": f"directory not found: {target_dir}"})
                    return
                try:
                    if sys.platform == "darwin":
                        subprocess.Popen(["open", str(target_dir)])
                    elif sys.platform == "win32":
                        subprocess.Popen(["explorer", str(target_dir)])
                    else:
                        subprocess.Popen(["xdg-open", str(target_dir)])
                    self.send_json(200, {"ok": True})
                    print(f"  [OPEN] {target_dir}", flush=True)
                except Exception as exc:
                    self.send_json(500, {"ok": False, "message": str(exc)})
                return

            if request_path == "/__restart":
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
                        subprocess.Popen(
                            [sys.executable] + sys.argv,
                            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                        )
                    else:
                        os.execv(sys.executable, [sys.executable] + sys.argv)

                Thread(target=_restart, daemon=True).start()
                return

            self.send_error(404)

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


# =====================================================
# Cache & CLI
# =====================================================


def default_cache_dir(pdf_root):
    root = str(pdf_root)
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", root.lstrip("/"))
    if len(safe) > 80:
        digest = hashlib.md5(root.encode()).hexdigest()[:8]
        safe = f"{Path(pdf_root).name}_{digest}"
    return Path.home() / ".cache" / "comicreader" / safe


def process_folder(folder, serve=False, host="127.0.0.1", port=8080, output_dir=None):
    root = Path(folder).expanduser().resolve()
    if not root.is_dir():
        print(f"错误: 文件夹不存在: {root}")
        sys.exit(1)

    out = Path(output_dir).expanduser().resolve() if output_dir else default_cache_dir(root)
    display_host = "localhost" if host in {"127.0.0.1", "::1"} else host
    base_url = f"http://{display_host}:{port}" if serve else None
    shutdown_token = secrets.token_urlsafe(24) if serve else None
    result = rebuild_catalog(root, out, base_url=base_url, shutdown_token=shutdown_token)
    if result is None:
        print("未找到 PDF 文件")
        sys.exit(0)

    stats = result["stats"]
    print(f"\n  {format_stats(stats)}", flush=True)
    print(f"  HTML: {stats['html']}", flush=True)
    print(f"  缓存: {out}", flush=True)

    if serve:
        url = f"http://{display_host}:{port}/output/{HTML_FILE}"
        state = {
            "lock": Lock(),
            "allowed_pdf_paths": result["allowed_pdf_paths"],
            "allowed_output_paths": result["allowed_output_paths"],
        }
        server = start_http_server(root, out, host, port, state, shutdown_token, base_url)
        print(f"  -> {url}", flush=True)
        try:
            webbrowser.open(url)
        except Exception as exc:
            print(f"  浏览器未自动打开: {exc}")
        try:
            while not server.shutdown_requested.wait(3600):
                pass
            print("\n已从网页端关闭", flush=True)
        except KeyboardInterrupt:
            print("\n已停止", flush=True)
            server.shutdown()


def parse_args():
    parser = argparse.ArgumentParser(description="Nocturne Manga - 配合 ComicRead 阅读器在线阅读 PDF")
    parser.add_argument("folder", help="PDF 文件夹路径")
    parser.add_argument("--serve", "-s", action="store_true", help="启动 HTTP 服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址 (默认: 127.0.0.1)")
    parser.add_argument("--port", "-p", type=int, default=8080, help="端口 (默认: 8080)")
    parser.add_argument("--output-dir", "-o", default=None, help="缓存目录 (默认: ~/.cache/comicreader/<路径>)")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    process_folder(
        args.folder,
        serve=args.serve,
        host=args.host,
        port=args.port,
        output_dir=args.output_dir,
    )

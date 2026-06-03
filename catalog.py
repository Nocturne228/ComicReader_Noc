#!/usr/bin/env python3
"""Nocturne Manga — PDF catalog server and CLI entry point."""
import argparse
import hashlib
import os
import re
import secrets
import sys
import webbrowser
from pathlib import Path
from threading import Lock

# Cross-platform stdout/stderr configuration
try:
    sys.stdout.reconfigure(line_buffering=True, write_through=True)
    sys.stderr.reconfigure(line_buffering=True, write_through=True)
except AttributeError:
    pass

from lib.builder import rebuild_catalog, format_stats
from lib.config import HTML_FILE, TOKEN_FILE
from lib.server import start_http_server


# =====================================================
# Token management  (stable across restarts)
# =====================================================


def _load_or_create_token(output_dir):
    """Read the persisted control token, or create a fresh one.

    Storing the token in the output directory keeps it stable across
    server restarts so the browser page does not need to reload to
    continue sending control requests.
    """
    token_path = Path(output_dir) / TOKEN_FILE
    if token_path.exists():
        return token_path.read_text(encoding="utf-8").strip()
    token = secrets.token_urlsafe(24)
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(token, encoding="utf-8")
    return token


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
    shutdown_token = _load_or_create_token(out) if serve else None
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
        if os.environ.get("COMICREAD_NO_BROWSER_OPEN") != "1":
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

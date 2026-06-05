#!/usr/bin/env python3
"""Nocturne Manga — PDF catalog server and CLI entry point.

This module provides the main entry point for the ComicReadScript application.
It handles command-line argument parsing, PDF folder processing, and HTTP server
startup for browsing漫画 collections with the ComicRead reader.
"""
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

    Args:
        output_dir: Directory where the token file is stored.

    Returns:
        str: The control token for authentication.
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
    """Generate a default cache directory path based on the PDF root path.

    When the PDF root directory is named "pdf", uses the sibling "workspace/"
    directory to co-locate all data alongside the work directory. Otherwise
    falls back to ~/.cache/comicreader/<safe_path>.

    Args:
        pdf_root: Root directory containing PDF files.

    Returns:
        Path: Absolute path to the cache directory.
    """
    root = Path(pdf_root).expanduser().resolve()
    if root.name == "pdf":
        return root.parent / "workspace"
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", str(root).lstrip("/"))
    if len(safe) > 80:
        digest = hashlib.md5(str(root).encode()).hexdigest()[:8]
        safe = f"{root.name}_{digest}"
    return Path.home() / ".cache" / "comicreader" / safe


def default_work_dir(pdf_root):
    """Prefer a workspace next to a conventional manga/pdf library."""
    root = Path(pdf_root).expanduser().resolve()
    if root.name == "pdf":
        return root.parent / "workspace"
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", str(root).lstrip("/"))
    if len(safe) > 80:
        digest = hashlib.md5(str(root).encode()).hexdigest()[:8]
        safe = f"{root.name}_{digest}"
    return Path.home() / ".cache" / "comicreader" / "workspace" / safe


def prepare_work_dir(work_dir):
    """Create the work directory structure with standard subdirectories.

    Args:
        work_dir: Base work directory path to create.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    for name in ["temp", "exports", "logs"]:
        (work_dir / name).mkdir(exist_ok=True)


def process_folder(
    folder,
    serve=False,
    host="127.0.0.1",
    port=8080,
    output_dir=None,
    range_support=None,
    work_dir=None,
):
    """Process a PDF folder and optionally start an HTTP server.

    This is the main processing function that scans PDF files, generates
    the HTML catalog, and optionally starts a local HTTP server for browsing.

    Args:
        folder: Path to the folder containing PDF files.
        serve: Whether to start an HTTP server after processing.
        host: Host address to bind the server to (default: 127.0.0.1).
        port: Port number for the server (default: 8080).
        output_dir: Custom output directory for generated files.
        range_support: Enable HTTP Range support for PDF streaming.
        work_dir: Custom work directory for tools and temporary files.
    """
    root = Path(folder).expanduser().resolve()
    if not root.is_dir():
        print(f"错误: 文件夹不存在: {root}")
        sys.exit(1)

    out = Path(output_dir).expanduser().resolve() if output_dir else default_cache_dir(root)
    work = Path(work_dir).expanduser().resolve() if work_dir else default_work_dir(root)
    if serve:
        prepare_work_dir(work)
    display_host = "localhost" if host in {"127.0.0.1", "::1"} else host
    base_url = f"http://{display_host}:{port}" if serve else None
    shutdown_token = _load_or_create_token(out) if serve else None

    if range_support is None:
        if not serve:
            range_support = False
        else:
            env_value = os.environ.get("COMICREAD_RANGE_SUPPORT")
            if env_value is not None:
                range_support = env_value.lower() not in {"0", "false", "no"}
            else:
                range_support = True

    result = rebuild_catalog(
        root,
        out,
        base_url=base_url,
        shutdown_token=shutdown_token,
        range_support=range_support,
        work_dir=work if serve else None,
    )
    if result is None:
        print("未找到 PDF 文件")
        sys.exit(0)

    stats = result["stats"]
    print(f"\n  {format_stats(stats)}")
    print(f"  HTML: {stats['html']}")
    print(f"  缓存: {out}")
    if serve:
        print(f"  工作区: {work}")

    if serve:
        url = f"http://{display_host}:{port}/output/{HTML_FILE}"
        state = {
            "lock": Lock(),
            "allowed_pdf_paths": result["allowed_pdf_paths"],
            "allowed_output_paths": result["allowed_output_paths"],
        }
        server = start_http_server(
            root,
            out,
            host,
            port,
            state,
            shutdown_token,
            base_url,
            range_support=range_support,
            work_dir=work,
        )
        print(f"  -> {url}")
        if os.environ.get("COMICREAD_NO_BROWSER_OPEN") != "1":
            try:
                webbrowser.open(url)
            except Exception as exc:
                print(f"  浏览器未自动打开: {exc}")
        try:
            while not server.shutdown_requested.wait(3600):
                pass
            print("\n已从网页端关闭")
        except KeyboardInterrupt:
            print("\n已停止")
            server.shutdown()


def parse_args():
    """Parse command-line arguments for the application.

    Returns:
        argparse.Namespace: Parsed command-line arguments.
    """
    parser = argparse.ArgumentParser(description="Nocturne Manga - 配合 ComicRead 阅读器在线阅读 PDF")
    parser.add_argument("folder", help="PDF 文件夹路径")
    parser.add_argument("--serve", "-s", action="store_true", help="启动 HTTP 服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址 (默认: 127.0.0.1)")
    parser.add_argument("--port", "-p", type=int, default=8080, help="端口 (默认: 8080)")
    parser.add_argument("--output-dir", "-o", default=None, help="缓存目录 (默认: ~/.cache/comicreader/<路径>)")
    parser.add_argument(
        "--work-dir",
        default=None,
        help="工具工作区目录 (默认: 若 PDF 目录名为 pdf，则使用同级 workspace)",
    )
    range_group = parser.add_mutually_exclusive_group()
    range_group.add_argument(
        "--enable-range",
        dest="range_support",
        action="store_true",
        help="启用 HTTP Range 支持，用于 PDF 按需加载",
    )
    range_group.add_argument(
        "--disable-range",
        dest="range_support",
        action="store_false",
        help="禁用 HTTP Range 支持，强制使用全量 PDF 下载",
    )
    parser.set_defaults(range_support=None)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    process_folder(
        args.folder,
        serve=args.serve,
        host=args.host,
        port=args.port,
        output_dir=args.output_dir,
        range_support=args.range_support,
        work_dir=args.work_dir,
    )

#!/usr/bin/env python3
"""Nocturne Manga — PDF catalog server and CLI entry point.

This module provides the main entry point for the ComicReadScript application.
It handles command-line argument parsing, PDF folder processing, and HTTP server
startup for browsing漫画 collections with the ComicRead reader.
"""
import argparse
import logging
import os
import secrets
import sys
import webbrowser
from pathlib import Path

# Cross-platform stdout/stderr configuration
try:
    sys.stdout.reconfigure(line_buffering=True, write_through=True)
    sys.stderr.reconfigure(line_buffering=True, write_through=True)
except AttributeError:
    pass

from lib.builder import rebuild_catalog, format_stats
from lib.config import (
    HTML_FILE,
    TOKEN_FILE,
    USER_CONFIG_FILE,
    load_user_config,
    save_user_config,
)
from lib.log import setup_logging
from lib.server import ServerState, start_http_server
from lib.utils import default_cache_dir

log = logging.getLogger(__name__)


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


def process_folder(
    folder,
    serve=False,
    host="127.0.0.1",
    port=8080,
    output_dir=None,
    range_support=None,
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
    """
    root = Path(folder).expanduser().resolve()
    if not root.is_dir():
        log.error("文件夹不存在: %s", root)
        sys.exit(1)

    out = Path(output_dir).expanduser().resolve() if output_dir else default_cache_dir(root)
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
    )
    if result is None:
        log.info("未找到 PDF 文件")
        sys.exit(0)

    stats = result["stats"]
    log.info("")
    log.info("  %s", format_stats(stats))
    log.info("  HTML: %s", stats["html"])
    log.info("  缓存: %s", out)

    if serve:
        url = f"http://{display_host}:{port}/output/{HTML_FILE}"
        state = ServerState(
            allowed_pdf_paths=result["allowed_pdf_paths"],
            allowed_output_paths=result["allowed_output_paths"],
        )
        server = start_http_server(
            root,
            out,
            host,
            port,
            state,
            shutdown_token,
            base_url,
            range_support=range_support,
            rebuild_fn=lambda: rebuild_catalog(
                root,
                out,
                base_url=base_url,
                shutdown_token=shutdown_token,
                allow_empty=True,
                range_support=range_support,
            ),
        )
        log.info("  -> %s", url)
        if os.environ.get("COMICREAD_NO_BROWSER_OPEN") != "1":
            try:
                webbrowser.open(url)
            except Exception as exc:
                log.warning("浏览器未自动打开: %s", exc)
        try:
            server.shutdown_requested.wait()
            log.info("\n已从网页端关闭")
        except KeyboardInterrupt:
            log.info("\n已停止")
        server.shutdown()


def parse_args():
    """Parse command-line arguments for the application.

    Returns:
        argparse.Namespace: Parsed command-line arguments.
    """
    parser = argparse.ArgumentParser(description="Nocturne Manga - 配合 ComicRead 阅读器在线阅读 PDF")
    parser.add_argument("folder", nargs="?", default=None, help="PDF 文件夹路径（可省略，从配置文件读取）")
    parser.add_argument("--serve", "-s", action="store_true", default=None, help="启动 HTTP 服务")
    parser.add_argument("--host", default=None, help="监听地址 (默认: 127.0.0.1)")
    parser.add_argument("--port", "-p", type=int, default=None, help="端口 (默认: 8080)")
    parser.add_argument("--output-dir", "-o", default=None, help="缓存目录 (默认: ~/.cache/comicreader/<路径>)")
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
    parser.add_argument("--verbose", "-v", action="store_true", help="显示详细日志")
    parser.add_argument("--config", default=None, help="配置文件路径 (默认: ~/.comicreader/config.json)")
    parser.add_argument(
        "--init-config",
        action="store_true",
        help="生成默认配置文件并退出",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    setup_logging(verbose=args.verbose)

    if args.init_config:
        save_user_config(
            {
                "folder": "/path/to/pdf/folder",
                "host": "127.0.0.1",
                "port": 8080,
                "serve": True,
                "range_support": True,
                "output_dir": "",
            },
            path=args.config,
        )
        config_path = args.config or str(USER_CONFIG_FILE)
        log.info("已生成配置文件: %s", config_path)
        sys.exit(0)

    config = load_user_config(path=args.config)

    folder = args.folder or config.get("folder", "")
    if not folder:
        log.error("未指定 PDF 文件夹路径。请通过命令行参数或配置文件 (%s) 设置。", USER_CONFIG_FILE)
        sys.exit(1)

    serve = args.serve if args.serve is not None else config.get("serve", False)
    host = args.host or config.get("host", "127.0.0.1")
    port = args.port if args.port is not None else config.get("port", 8080)
    output_dir = args.output_dir or config.get("output_dir") or None

    range_support = args.range_support
    if range_support is None:
        config_range = config.get("range_support")
        range_support = config_range if config_range is not None else None

    process_folder(
        folder,
        serve=serve,
        host=host,
        port=port,
        output_dir=output_dir,
        range_support=range_support,
    )

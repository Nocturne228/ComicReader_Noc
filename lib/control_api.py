"""HTTP handlers for local server control endpoints.

This module provides HTTP handlers for server management operations including
shutdown, refresh, opening files in native applications, and restarting.
"""
import json
import os
import subprocess
import sys
import time
import traceback
from pathlib import Path
from threading import Thread

from lib.builder import format_stats, rebuild_catalog
from lib.security import normalize_pdf_request_path
from lib.utils import safe_join


def handle_shutdown(handler, ctx):
    """Handle server shutdown request.

    Args:
        handler: HTTP request handler instance.
        ctx: Server context with shutdown event.
    """
    if not handler.check_control_request():
        return
    handler.send_json(200, {"ok": True, "message": "server shutting down"})
    ctx.shutdown_requested.set()
    Thread(target=handler.server.shutdown, daemon=True).start()


def handle_refresh(handler, ctx):
    """Handle catalog refresh request.

    Args:
        handler: HTTP request handler instance.
        ctx: Server context with refresh lock.
    """
    if not handler.check_control_request():
        return
    if not ctx.refresh_lock.acquire(blocking=False):
        handler.send_json(409, {"ok": False, "message": "refresh already running"})
        return
    try:
        result = rebuild_catalog(
            ctx.pdf_root,
            ctx.output_dir,
            base_url=ctx.base_url,
            shutdown_token=ctx.shutdown_token,
            allow_empty=True,
            range_support=ctx.range_support,
        )
        with ctx.state["lock"]:
            ctx.state["allowed_pdf_paths"] = result["allowed_pdf_paths"]
            ctx.state["allowed_output_paths"] = result["allowed_output_paths"]
        handler.send_json(200, {"ok": True, "stats": result["stats"]})
        print(f"  [REFRESH] {format_stats(result['stats'])}")
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})
        print(f"  [REFRESH] 错误: {exc}")
        print(f"  [REFRESH] 详情:\n{traceback.format_exc()}")
    finally:
        ctx.refresh_lock.release()


def handle_open_native(handler, ctx):
    """Handle request to open PDF in native macOS Preview application.

    Args:
        handler: HTTP request handler instance.
        ctx: Server context with PDF root and state.
    """
    if not handler.check_control_request():
        return
    if sys.platform != "darwin":
        handler.send_json(501, {"ok": False, "message": "Preview is only available on macOS"})
        return
    try:
        body = handler.read_json_body()
        rel = normalize_pdf_request_path(body.get("pdf", ""))
    except Exception:
        handler.send_json(400, {"ok": False, "message": "invalid request body"})
        return
    with ctx.state["lock"]:
        allowed_pdf_paths = set(ctx.state["allowed_pdf_paths"])
    if rel not in allowed_pdf_paths:
        handler.send_json(403, {"ok": False, "message": "pdf is not indexed"})
        return
    file_path = Path(safe_join(ctx.pdf_root, rel))
    if not file_path.is_file():
        handler.send_json(404, {"ok": False, "message": "file not found"})
        return
    try:
        subprocess.Popen(["open", "-a", "Preview", str(file_path)])
        handler.send_json(200, {"ok": True})
        print(f"  [OPEN] Preview: {rel}")
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})
        print(f"  [OPEN] 错误: {exc}")


def handle_open_folder(handler, ctx):
    """Handle request to open a directory in the system file manager."""
    if not handler.check_control_request():
        return
    try:
        target = ctx.pdf_root
        if sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        elif sys.platform == "win32":
            os.startfile(str(target))
        else:
            subprocess.Popen(["xdg-open", str(target)])
        handler.send_json(200, {"ok": True})
        print(f"  [OPEN] {target}")
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_restart(handler, ctx):
    if not handler.check_control_request():
        return
    handler.send_json(200, {"ok": True, "message": "restarting..."})
    print("  [RESTART] 正在重启服务...")

    def restart():
        time.sleep(0.3)
        try:
            handler.server.shutdown()
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
            ctx.shutdown_requested.set()
        else:
            os.environ["COMICREAD_NO_BROWSER_OPEN"] = "1"
            os.execv(sys.executable, [sys.executable] + sys.argv)

    Thread(target=restart, daemon=True).start()

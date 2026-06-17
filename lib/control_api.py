"""HTTP handlers for local server control endpoints.

This module provides HTTP handlers for server management operations including
shutdown, refresh, opening files in native applications, and opening the
library root in the system file manager.
"""
import logging
import os
import subprocess
import sys
import traceback
from pathlib import Path
from threading import Thread

from lib.builder import format_stats
from lib.security import normalize_pdf_request_path
from lib.utils import safe_join

log = logging.getLogger(__name__)


def _open_in_file_manager(path):
    """Open a directory in the platform's file manager."""
    path = str(Path(path).resolve())
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif sys.platform == "win32":
        subprocess.Popen(["explorer", path])
    else:
        subprocess.Popen(["xdg-open", path])


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


def handle_refresh(handler, ctx):
    """Handle catalog refresh request.

    Args:
        handler: HTTP request handler instance.
        ctx: Server context with refresh lock and rebuild_fn.
    """
    if not handler.check_control_request():
        return
    if not ctx.refresh_lock.acquire(blocking=False):
        handler.send_json(409, {"ok": False, "message": "refresh already running"})
        return
    try:
        result = ctx.rebuild_fn()
        ctx.state.update_paths(result["allowed_pdf_paths"], result["allowed_output_paths"])
        handler.send_json(200, {"ok": True, "stats": result["stats"]})
        log.info("[REFRESH] %s", format_stats(result["stats"]))
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})
        log.error("[REFRESH] 错误: %s", exc)
        log.debug("[REFRESH] 详情:\n%s", traceback.format_exc())
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
    _, allowed_pdf_paths = ctx.state.get_allowed_paths()
    if rel not in allowed_pdf_paths:
        handler.send_json(403, {"ok": False, "message": "pdf is not indexed"})
        return
    try:
        file_path = Path(safe_join(ctx.pdf_root, rel))
    except ValueError:
        handler.send_json(403, {"ok": False, "message": "invalid path"})
        return
    if not file_path.is_file():
        handler.send_json(404, {"ok": False, "message": "file not found"})
        return
    try:
        subprocess.Popen(["open", "-a", "Preview", str(file_path)])
        handler.send_json(200, {"ok": True})
        log.info("[OPEN] Preview: %s", rel)
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})
        log.error("[OPEN] 错误: %s", exc)


def handle_open_root(handler, ctx):
    """Handle request to open the PDF root directory in the system file manager.

    Args:
        handler: HTTP request handler instance.
        ctx: Server context with PDF root.
    """
    if not handler.check_control_request():
        return
    try:
        _open_in_file_manager(ctx.pdf_root)
        handler.send_json(200, {"ok": True})
        log.info("[OPEN] root: %s", ctx.pdf_root)
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})
        log.error("[OPEN] 错误: %s", exc)


def handle_restart(handler, ctx):
    if not handler.check_control_request():
        return
    handler.send_json(200, {"ok": True, "message": "restarting..."})
    log.info("[RESTART] 正在重启服务...")

    def restart():
        import time

        env = os.environ.copy()
        env["COMICREAD_NO_BROWSER_OPEN"] = "1"

        kwargs = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        subprocess.Popen(
            [sys.executable] + sys.argv,
            env=env,
            **kwargs,
        )

        time.sleep(0.5)
        try:
            handler.server.shutdown()
        except Exception:
            pass
        ctx.shutdown_requested.set()

    Thread(target=restart, daemon=True).start()

"""HTTP handlers for tag data endpoints."""
from urllib.parse import unquote

from lib.tag_manager import delete_tag, load_tags, rename_tag, update_pdf_tags


def handle_tags_get(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        handler.send_json(200, load_tags(ctx.output_dir))
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_tag_update(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        pdf_path = unquote(body.get("pdf", ""))
        tags = body.get("tags", [])
        if not pdf_path:
            handler.send_json(400, {"ok": False, "message": "pdf path required"})
            return
        with ctx.state["lock"]:
            allowed_pdf_paths = set(ctx.state["allowed_pdf_paths"])
        if pdf_path not in allowed_pdf_paths:
            handler.send_json(403, {"ok": False, "message": "pdf is not indexed"})
            return
        tag_data = update_pdf_tags(ctx.output_dir, pdf_path, tags)
        handler.send_json(200, {"ok": True, **tag_data})
        print(f"  [TAG] Updated tags for {pdf_path}: {tags}", flush=True)
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_tag_rename(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        old_name = body.get("old", "")
        new_name = body.get("new", "")
        if not old_name or not new_name:
            handler.send_json(400, {"ok": False, "message": "old and new names required"})
            return
        tag_data = rename_tag(ctx.output_dir, old_name, new_name)
        handler.send_json(200, {"ok": True, **tag_data})
        print(f"  [TAG] Renamed tag: {old_name} -> {new_name}", flush=True)
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_tag_delete(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        tag_name = body.get("tag", "")
        if not tag_name:
            handler.send_json(400, {"ok": False, "message": "tag name required"})
            return
        tag_data = delete_tag(ctx.output_dir, tag_name)
        handler.send_json(200, {"ok": True, **tag_data})
        print(f"  [TAG] Deleted tag: {tag_name}", flush=True)
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})

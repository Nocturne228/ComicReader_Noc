"""HTTP handlers for page notes."""
from urllib.parse import unquote

from lib.page_notes import (
    delete_page_note,
    get_pdf_page_notes,
    load_page_notes,
    update_last_read_page,
    upsert_page_note,
)


def _read_allowed_pdf(handler, ctx, body):
    pdf_path = unquote(body.get("pdf", ""))
    if not pdf_path:
        handler.send_json(400, {"ok": False, "message": "pdf path required"})
        return None
    with ctx.state["lock"]:
        allowed_pdf_paths = set(ctx.state["allowed_pdf_paths"])
    if pdf_path not in allowed_pdf_paths:
        handler.send_json(403, {"ok": False, "message": "pdf is not indexed"})
        return None
    return pdf_path


def handle_page_notes_get(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        pdf_path = body.get("pdf")
        if pdf_path:
            pdf_path = _read_allowed_pdf(handler, ctx, body)
            if not pdf_path:
                return
            handler.send_json(200, {"ok": True, "pdf": pdf_path, **get_pdf_page_notes(ctx.output_dir, pdf_path)})
            return
        handler.send_json(200, {"ok": True, **load_page_notes(ctx.output_dir)})
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_page_note_upsert(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        pdf_path = _read_allowed_pdf(handler, ctx, body)
        if not pdf_path:
            return
        note = body.get("note")
        entry = upsert_page_note(ctx.output_dir, pdf_path, note)
        handler.send_json(200, {"ok": True, "pdf": pdf_path, **entry})
        print(f"  [NOTE] Upserted note for {pdf_path}: page {note.get('page') if isinstance(note, dict) else '?'}", flush=True)
    except ValueError as exc:
        handler.send_json(400, {"ok": False, "message": str(exc)})
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_page_note_delete(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        pdf_path = _read_allowed_pdf(handler, ctx, body)
        if not pdf_path:
            return
        note_id = str(body.get("id") or "").strip()
        if not note_id:
            handler.send_json(400, {"ok": False, "message": "note id required"})
            return
        entry = delete_page_note(ctx.output_dir, pdf_path, note_id)
        handler.send_json(200, {"ok": True, "pdf": pdf_path, **entry})
        print(f"  [NOTE] Deleted note for {pdf_path}: {note_id}", flush=True)
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})


def handle_page_note_last_read(handler, ctx):
    if not handler.check_control_request():
        return
    try:
        body = handler.read_json_body()
        pdf_path = _read_allowed_pdf(handler, ctx, body)
        if not pdf_path:
            return
        entry = update_last_read_page(ctx.output_dir, pdf_path, body.get("page"))
        handler.send_json(200, {"ok": True, "pdf": pdf_path, **entry})
        print(f"  [NOTE] Last read for {pdf_path}: page {entry.get('lastReadPage')}", flush=True)
    except ValueError as exc:
        handler.send_json(400, {"ok": False, "message": str(exc)})
    except Exception as exc:
        handler.send_json(500, {"ok": False, "message": str(exc)})

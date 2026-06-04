"""Page note persistence for PDF catalog entries."""
import json
import os
import time
import uuid
from pathlib import Path
from threading import RLock

PAGE_NOTES_FILE = "page_notes.json"
PAGE_NOTES_BACKUP_FILE = "page_notes.json.bak"
_PAGE_NOTES_LOCK = RLock()


def _empty_notes():
    return {"version": 1, "pdfs": {}}


def _normalize_note(note):
    if not isinstance(note, dict):
        return None
    try:
        page = int(note.get("page", 0))
    except (TypeError, ValueError):
        return None
    if page < 1:
        return None

    title = str(note.get("title") or "").strip()
    body = str(note.get("body") or "").strip()
    note_id = str(note.get("id") or "").strip()
    if not note_id:
        note_id = f"note_{uuid.uuid4().hex}"

    now = int(time.time())
    created_at = note.get("createdAt")
    updated_at = note.get("updatedAt")
    try:
        created_at = int(created_at)
    except (TypeError, ValueError):
        created_at = now
    try:
        updated_at = int(updated_at)
    except (TypeError, ValueError):
        updated_at = now

    tags = []
    seen = set()
    raw_tags = note.get("tags", [])
    if isinstance(raw_tags, list):
        for tag in raw_tags:
            if not isinstance(tag, str):
                continue
            tag = tag.strip()
            if tag and tag not in seen:
                tags.append(tag)
                seen.add(tag)

    return {
        "id": note_id,
        "page": page,
        "title": title,
        "body": body,
        "tags": tags,
        "createdAt": created_at,
        "updatedAt": updated_at,
    }


def _normalize_pdf_entry(entry):
    if isinstance(entry, list):
        notes = entry
        last_read_page = None
        last_read_at = None
    elif isinstance(entry, dict):
        notes = entry.get("notes", [])
        last_read_page = entry.get("lastReadPage")
        last_read_at = entry.get("lastReadAt")
    else:
        notes = []
        last_read_page = None
        last_read_at = None

    normalized_notes = []
    seen_ids = set()
    if isinstance(notes, list):
        for note in notes:
            normalized = _normalize_note(note)
            if not normalized or normalized["id"] in seen_ids:
                continue
            normalized_notes.append(normalized)
            seen_ids.add(normalized["id"])
    normalized_notes.sort(key=lambda item: (item["page"], item["createdAt"], item["id"]))

    try:
        last_read_page = int(last_read_page)
    except (TypeError, ValueError):
        last_read_page = None
    if last_read_page is not None and last_read_page < 1:
        last_read_page = None

    try:
        last_read_at = int(last_read_at)
    except (TypeError, ValueError):
        last_read_at = None

    result = {"notes": normalized_notes}
    if last_read_page is not None:
        result["lastReadPage"] = last_read_page
    if last_read_at is not None:
        result["lastReadAt"] = last_read_at
    return result


def normalize_page_notes_data(data):
    if not isinstance(data, dict):
        return _empty_notes()

    pdfs = {}
    raw_pdfs = data.get("pdfs", {})
    if isinstance(raw_pdfs, dict):
        for pdf_path, entry in raw_pdfs.items():
            if not isinstance(pdf_path, str) or not pdf_path:
                continue
            normalized = _normalize_pdf_entry(entry)
            if normalized["notes"] or normalized.get("lastReadPage"):
                pdfs[pdf_path] = normalized
    return {"version": 1, "pdfs": pdfs}


def load_page_notes(output_dir):
    with _PAGE_NOTES_LOCK:
        notes_path = Path(output_dir) / PAGE_NOTES_FILE
        if not notes_path.exists():
            return _empty_notes()
        try:
            data = json.loads(notes_path.read_text(encoding="utf-8"))
            return normalize_page_notes_data(data)
        except Exception:
            return _empty_notes()


def save_page_notes(output_dir, notes_data):
    with _PAGE_NOTES_LOCK:
        notes_path = Path(output_dir) / PAGE_NOTES_FILE
        backup_path = Path(output_dir) / PAGE_NOTES_BACKUP_FILE
        tmp_path = notes_path.with_suffix(notes_path.suffix + ".tmp")
        notes_path.parent.mkdir(parents=True, exist_ok=True)
        normalized = normalize_page_notes_data(notes_data)
        if notes_path.exists():
            try:
                backup_path.write_bytes(notes_path.read_bytes())
            except OSError:
                pass
        tmp_path.write_text(
            json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(tmp_path, notes_path)


def get_pdf_page_notes(output_dir, pdf_path):
    data = load_page_notes(output_dir)
    return data["pdfs"].get(pdf_path, {"notes": []})


def upsert_page_note(output_dir, pdf_path, note):
    with _PAGE_NOTES_LOCK:
        data = load_page_notes(output_dir)
        entry = data["pdfs"].setdefault(pdf_path, {"notes": []})
        normalized = _normalize_note(note)
        if not normalized:
            raise ValueError("invalid note")

        now = int(time.time())
        normalized["updatedAt"] = now
        for idx, existing in enumerate(entry.get("notes", [])):
            if existing.get("id") == normalized["id"]:
                normalized["createdAt"] = existing.get("createdAt", normalized["createdAt"])
                entry["notes"][idx] = normalized
                break
        else:
            normalized["createdAt"] = now
            entry.setdefault("notes", []).append(normalized)

        data = normalize_page_notes_data(data)
        save_page_notes(output_dir, data)
        return data["pdfs"].get(pdf_path, {"notes": []})


def delete_page_note(output_dir, pdf_path, note_id):
    with _PAGE_NOTES_LOCK:
        data = load_page_notes(output_dir)
        entry = data["pdfs"].get(pdf_path)
        if not entry:
            return {"notes": []}
        entry["notes"] = [
            note for note in entry.get("notes", []) if note.get("id") != note_id
        ]
        data = normalize_page_notes_data(data)
        save_page_notes(output_dir, data)
        return data["pdfs"].get(pdf_path, {"notes": []})


def update_last_read_page(output_dir, pdf_path, page):
    with _PAGE_NOTES_LOCK:
        try:
            page = int(page)
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid page") from exc
        if page < 1:
            raise ValueError("invalid page")

        data = load_page_notes(output_dir)
        entry = data["pdfs"].setdefault(pdf_path, {"notes": []})
        entry["lastReadPage"] = page
        entry["lastReadAt"] = int(time.time())
        data = normalize_page_notes_data(data)
        save_page_notes(output_dir, data)
        return data["pdfs"].get(pdf_path, {"notes": []})


def reconcile_page_notes(output_dir, pdf_files, root):
    with _PAGE_NOTES_LOCK:
        data = load_page_notes(output_dir)
        existing = {p.relative_to(root).as_posix() for p in pdf_files}
        by_name = {}
        for pdf in pdf_files:
            rel = pdf.relative_to(root).as_posix()
            by_name.setdefault(Path(rel).name, []).append(rel)

        migrated = 0
        removed = 0
        for old_path in list(data["pdfs"].keys()):
            if old_path in existing:
                continue

            candidates = by_name.get(Path(old_path).name, [])
            if len(candidates) == 1:
                new_path = candidates[0]
                old_entry = data["pdfs"].pop(old_path)
                new_entry = data["pdfs"].setdefault(new_path, {"notes": []})
                new_entry["notes"] = new_entry.get("notes", []) + old_entry.get("notes", [])
                if old_entry.get("lastReadPage"):
                    new_entry["lastReadPage"] = old_entry["lastReadPage"]
                    if old_entry.get("lastReadAt"):
                        new_entry["lastReadAt"] = old_entry["lastReadAt"]
                migrated += 1
            else:
                del data["pdfs"][old_path]
                removed += 1

        data = normalize_page_notes_data(data)
        save_page_notes(output_dir, data)
        return data, migrated, removed

"""Tag data management for PDF catalog.

This module handles the persistence and management of tags associated with
PDF files, including loading, saving, and updating tag data.
"""
import json
import os
import shutil
from pathlib import Path
from threading import RLock

TAGS_FILE = "tags.json"
TAGS_BACKUP_FILE = "tags.json.bak"
_TAG_LOCK = RLock()


def _empty_tags():
    """Return an empty tags data structure.

    Returns:
        dict: Empty tags data with empty tags list and pdfs dict.
    """
    return {"tags": [], "pdfs": {}}


def _normalize_tags(tags):
    """Normalize and deduplicate a list of tags.

    Args:
        tags: List of tag strings to normalize.

    Returns:
        list: Cleaned and deduplicated tag strings.
    """
    if not isinstance(tags, list):
        return []
    cleaned = []
    seen = set()
    for tag in tags:
        if not isinstance(tag, str):
            continue
        tag = tag.strip()
        if not tag or tag in seen:
            continue
        cleaned.append(tag)
        seen.add(tag)
    return cleaned


def normalize_tag_data(data):
    """Return a validated tag data structure.

    Args:
        data: Raw tag data to validate and normalize.

    Returns:
        dict: Normalized tag data with sorted tags list and pdfs dict.
    """
    if not isinstance(data, dict):
        return _empty_tags()

    pdfs = {}
    raw_pdfs = data.get("pdfs", {})
    if isinstance(raw_pdfs, dict):
        for pdf_path, tags in raw_pdfs.items():
            if not isinstance(pdf_path, str) or not pdf_path:
                continue
            cleaned_tags = _normalize_tags(tags)
            if cleaned_tags:
                pdfs[pdf_path] = cleaned_tags

    all_tags = set()
    for tags in pdfs.values():
        all_tags.update(tags)

    return {"tags": sorted(all_tags), "pdfs": pdfs}


def _load_tags_raw(output_dir):
    tag_path = Path(output_dir) / TAGS_FILE
    if not tag_path.exists():
        return _empty_tags()
    try:
        data = json.loads(tag_path.read_text(encoding="utf-8"))
        return normalize_tag_data(data)
    except Exception:
        return _empty_tags()


def _save_tags_raw(output_dir, tag_data):
    tag_path = Path(output_dir) / TAGS_FILE
    backup_path = Path(output_dir) / TAGS_BACKUP_FILE
    tmp_path = tag_path.with_suffix(tag_path.suffix + ".tmp")
    tag_path.parent.mkdir(parents=True, exist_ok=True)
    normalized = normalize_tag_data(tag_data)
    if tag_path.exists():
        try:
            shutil.copy2(tag_path, backup_path)
        except OSError:
            pass
    tmp_path.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp_path, tag_path)


def load_tags(output_dir):
    """Load tags data from tags.json.

    Args:
        output_dir: Directory containing tags.json file.

    Returns:
        dict: Tag data with tags list and pdfs mapping.
    """
    with _TAG_LOCK:
        return _load_tags_raw(output_dir)


def save_tags(output_dir, tag_data):
    """Save tags data to tags.json with atomic write and backup.

    Args:
        output_dir: Directory containing tags.json file.
        tag_data: Tag data to save.
    """
    with _TAG_LOCK:
        _save_tags_raw(output_dir, tag_data)


def update_pdf_tags(output_dir, pdf_path, tags):
    """Update tags for a single PDF.

    Args:
        output_dir: Cache directory path.
        pdf_path: Relative PDF path (key in catalog_index.json).
        tags: List of tag strings.

    Returns:
        dict: Updated tag data.
    """
    with _TAG_LOCK:
        tag_data = _load_tags_raw(output_dir)
        tags = _normalize_tags(tags)
        if tags:
            tag_data["pdfs"][pdf_path] = tags
        else:
            tag_data["pdfs"].pop(pdf_path, None)
        tag_data = normalize_tag_data(tag_data)
        _save_tags_raw(output_dir, tag_data)
        return tag_data


def rename_tag(output_dir, old_name, new_name):
    """Rename a tag across all PDFs.

    Returns:
        dict: Updated tag data.
    """
    with _TAG_LOCK:
        tag_data = _load_tags_raw(output_dir)
        old_name = old_name.strip()
        new_name = new_name.strip()
        if not old_name or not new_name or old_name == new_name:
            return tag_data

        for pdf_path in list(tag_data["pdfs"].keys()):
            pdf_tags = tag_data["pdfs"][pdf_path]
            tag_data["pdfs"][pdf_path] = [
                new_name if t == old_name else t for t in pdf_tags
            ]

        tag_data = normalize_tag_data(tag_data)
        _save_tags_raw(output_dir, tag_data)
        return tag_data


def delete_tag(output_dir, tag_name):
    """Delete a tag from all PDFs.

    Returns:
        dict: Updated tag data.
    """
    with _TAG_LOCK:
        tag_data = _load_tags_raw(output_dir)
        tag_name = tag_name.strip()
        if not tag_name:
            return tag_data

        for pdf_path in list(tag_data["pdfs"].keys()):
            tag_data["pdfs"][pdf_path] = [
                t for t in tag_data["pdfs"][pdf_path] if t != tag_name
            ]
            if not tag_data["pdfs"][pdf_path]:
                del tag_data["pdfs"][pdf_path]

        tag_data = normalize_tag_data(tag_data)
        _save_tags_raw(output_dir, tag_data)
        return tag_data


def reconcile_tags(output_dir, pdf_files, root):
    """Migrate and remove tag entries so they match the current PDF set.

    Args:
    Returns:
        tuple: (tag_data, migrated_count, removed_count)
    """
    with _TAG_LOCK:
        tag_data = _load_tags_raw(output_dir)
        existing = {p.relative_to(root).as_posix() for p in pdf_files}
        by_name = {}
        for pdf in pdf_files:
            rel = pdf.relative_to(root).as_posix()
            by_name.setdefault(Path(rel).name, []).append(rel)

        migrated = 0
        removed = 0
        for old_path in list(tag_data["pdfs"].keys()):
            if old_path in existing:
                continue

            candidates = by_name.get(Path(old_path).name, [])
            if len(candidates) == 1:
                new_path = candidates[0]
                old_tags = tag_data["pdfs"].pop(old_path)
                merged = tag_data["pdfs"].get(new_path, []) + old_tags
                tag_data["pdfs"][new_path] = _normalize_tags(merged)
                migrated += 1
            else:
                del tag_data["pdfs"][old_path]
                removed += 1

        tag_data = normalize_tag_data(tag_data)
        _save_tags_raw(output_dir, tag_data)
        return tag_data, migrated, removed

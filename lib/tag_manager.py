"""Tag data management for PDF catalog."""
import json
from pathlib import Path

TAGS_FILE = "tags.json"


def load_tags(output_dir):
    """Load tags data from tags.json.
    
    Returns:
        dict: {"tags": [...], "pdfs": {"path": [...]}}
    """
    tag_path = Path(output_dir) / TAGS_FILE
    if not tag_path.exists():
        return {"tags": [], "pdfs": {}}
    try:
        data = json.loads(tag_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"tags": [], "pdfs": {}}
        tags = data.get("tags", [])
        pdfs = data.get("pdfs", {})
        if not isinstance(tags, list):
            tags = []
        if not isinstance(pdfs, dict):
            pdfs = {}
        return {"tags": tags, "pdfs": pdfs}
    except Exception:
        return {"tags": [], "pdfs": {}}


def save_tags(output_dir, tag_data):
    """Save tags data to tags.json."""
    tag_path = Path(output_dir) / TAGS_FILE
    tag_path.parent.mkdir(parents=True, exist_ok=True)
    tag_path.write_text(
        json.dumps(tag_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def update_pdf_tags(output_dir, pdf_path, tags):
    """Update tags for a single PDF.
    
    Args:
        output_dir: Cache directory path.
        pdf_path: Relative PDF path (key in catalog_index.json).
        tags: List of tag strings.
    
    Returns:
        dict: Updated tag data.
    """
    tag_data = load_tags(output_dir)
    tags = [t.strip() for t in tags if t.strip()]
    if tags:
        tag_data["pdfs"][pdf_path] = tags
        for tag in tags:
            if tag not in tag_data["tags"]:
                tag_data["tags"].append(tag)
    else:
        tag_data["pdfs"].pop(pdf_path, None)
    tag_data["tags"] = sorted(set(tag_data["tags"]))
    save_tags(output_dir, tag_data)
    return tag_data


def rename_tag(output_dir, old_name, new_name):
    """Rename a tag across all PDFs.
    
    Returns:
        dict: Updated tag data.
    """
    tag_data = load_tags(output_dir)
    new_name = new_name.strip()
    if not new_name or old_name == new_name:
        return tag_data
    
    if old_name not in tag_data["tags"]:
        return tag_data
    
    tag_data["tags"] = [
        new_name if t == old_name else t for t in tag_data["tags"]
    ]
    tag_data["tags"] = sorted(set(tag_data["tags"]))
    
    for pdf_path in list(tag_data["pdfs"].keys()):
        pdf_tags = tag_data["pdfs"][pdf_path]
        tag_data["pdfs"][pdf_path] = [
            new_name if t == old_name else t for t in pdf_tags
        ]
    
    save_tags(output_dir, tag_data)
    return tag_data


def delete_tag(output_dir, tag_name):
    """Delete a tag from all PDFs.
    
    Returns:
        dict: Updated tag data.
    """
    tag_data = load_tags(output_dir)
    tag_data["tags"] = [t for t in tag_data["tags"] if t != tag_name]
    
    for pdf_path in list(tag_data["pdfs"].keys()):
        tag_data["pdfs"][pdf_path] = [
            t for t in tag_data["pdfs"][pdf_path] if t != tag_name
        ]
        if not tag_data["pdfs"][pdf_path]:
            del tag_data["pdfs"][pdf_path]
    
    save_tags(output_dir, tag_data)
    return tag_data


def migrate_removed_entries(tag_data, pdf_files, root):
    """Remove tag entries for PDFs that no longer exist.
    
    Args:
        tag_data: Tag data dict.
        pdf_files: List of Path objects for existing PDFs.
        root: Root directory of PDF collection.
    
    Returns:
        int: Number of entries removed.
    """
    existing = {p.relative_to(root).as_posix() for p in pdf_files}
    removed = 0
    for pdf_path in list(tag_data["pdfs"].keys()):
        if pdf_path not in existing:
            del tag_data["pdfs"][pdf_path]
            removed += 1
    return removed

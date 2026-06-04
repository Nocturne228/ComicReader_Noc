"""Utility functions shared across modules.

This module provides common utility functions used throughout the application,
including file operations, path manipulation, and data processing helpers.
"""
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.parse import quote

from lib.config import (
    CSS_FILE,
    HTML_FILE,
    JS_FILE,
    TAG_JS_FILE,
    TAG_UI_JS_FILE,
    TOOLS_JS_FILE,
    PDFJS_DIR,
    PDFJS_FILE,
    PDFJS_WORKER_FILE,
    UMD_FILE,
    UMD_SRC,
    STATIC_DIR,
    VENDOR_DIR,
    EXCLUDE_DIRS,
)


def sanitize_filename(name):
    """Sanitize a filename by removing invalid characters.

    Args:
        name: Original filename.

    Returns:
        str: Sanitized filename with invalid characters replaced.
    """
    name = re.sub(r'[\\/*?:"<>|]', "_", name).strip()
    return name or "cover"


def cover_filename(key):
    """Generate a unique cover image filename from a PDF path key.

    Args:
        key: PDF path key (relative to root).

    Returns:
        str: Unique JPEG filename for the cover image.
    """
    stem = sanitize_filename(Path(key).stem)[:80]
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    return f"{stem}-{digest}.jpg"


def quote_rel_path(key):
    """Quote a relative path for use in HTML URLs.

    Args:
        key: Relative path string.

    Returns:
        str: Quoted path with proper URL encoding.
    """
    return "../" + "/".join(quote(part) for part in key.split("/"))


def load_index(path):
    """Load the catalog index from a JSON file.

    Args:
        path: Path to the index JSON file.

    Returns:
        dict: Index data mapping relative paths to metadata.
    """
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"警告: 无法读取索引 {path}: {exc}")
        return {}


def save_index(path, data):
    """Save the catalog index to a JSON file.

    Args:
        path: Path to the index JSON file.
        data: Index data to save.
    """
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def human_size(size):
    """Convert a file size in bytes to a human-readable string.

    Args:
        size: File size in bytes.

    Returns:
        str: Human-readable size string (e.g., "1.5 MB").
    """
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def safe_join(base, rel):
    """Safely join a base path with a relative path, preventing traversal.

    Args:
        base: Base directory path.
        rel: Relative path to join.

    Returns:
        str: Joined path if valid, or "__invalid_path__" if traversal detected.
    """
    base = Path(base).resolve()
    candidate = (base / rel).resolve()
    if candidate == base or base in candidate.parents:
        return str(candidate)
    return str(base / "__invalid_path__")


def build_allowed_output_paths(index):
    """Build a set of allowed output paths for HTTP serving.

    Args:
        index: Catalog index data.

    Returns:
        set: Set of allowed relative paths for HTTP serving.
    """
    paths = {HTML_FILE, CSS_FILE, JS_FILE, TAG_JS_FILE, TAG_UI_JS_FILE, TOOLS_JS_FILE}
    paths.add(f"{VENDOR_DIR}/{UMD_FILE}")
    paths.update(f"{PDFJS_DIR}/{name}" for name in [PDFJS_FILE, PDFJS_WORKER_FILE])
    # Subdirectory modules (css/)
    css_dir = STATIC_DIR / "css"
    if css_dir.exists():
        for f in css_dir.glob("*.css"):
            paths.add(f"css/{f.name}")
    for info in index.values():
        image_name = info.get("image")
        if image_name:
            paths.add(f"images/{image_name}")
    return paths


def copy_if_changed(src, dst):
    """Copy a file only if it has changed since the last copy.

    Args:
        src: Source file path.
        dst: Destination file path.

    Returns:
        bool: True if file was copied, False if unchanged.
    """
    if not src.exists():
        return False
    if dst.exists():
        src_stat = src.stat()
        dst_stat = dst.stat()
        if src_stat.st_size == dst_stat.st_size and src_stat.st_mtime_ns == dst_stat.st_mtime_ns:
            return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def iter_runtime_assets():
    yield UMD_SRC, f"{VENDOR_DIR}/{UMD_FILE}"
    yield STATIC_DIR / CSS_FILE, CSS_FILE
    yield STATIC_DIR / JS_FILE, JS_FILE
    yield STATIC_DIR / TAG_JS_FILE, TAG_JS_FILE
    yield STATIC_DIR / TAG_UI_JS_FILE, TAG_UI_JS_FILE
    yield STATIC_DIR / TOOLS_JS_FILE, TOOLS_JS_FILE
    for name in [PDFJS_FILE, PDFJS_WORKER_FILE]:
        yield STATIC_DIR / PDFJS_DIR / name, f"{PDFJS_DIR}/{name}"

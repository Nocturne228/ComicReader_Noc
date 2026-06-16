"""Utility functions shared across modules.

This module provides common utility functions used throughout the application,
including file operations, path manipulation, and data processing helpers.
"""
import hashlib
import json
import logging
import re
import shutil
from pathlib import Path
from urllib.parse import quote

from lib.config import (
    CSS_FILE,
    JS_FILE,
    MODULES_DIR,
    PDFJS_DIR,
    PDFJS_FILE,
    PDFJS_WORKER_FILE,
    UMD_FILE,
    UMD_SRC,
    STATIC_DIR,
    VENDOR_DIR,
)

log = logging.getLogger(__name__)

DEPRECATED_RUNTIME_ASSETS = {
    "tag.js",
    "tag_ui.js",
    "page_notes.js",
    "catalog.js",
    "context_menu.js",
    "css/tags.css",
    "css/page_notes.css",
    "css/tools.css",
    "css/base.css",
    "css/layout.css",
    "css/sidebar.css",
    "css/cards.css",
    "css/toolbar.css",
    "css/dropdown.css",
    "css/progress.css",
    "css/theme.css",
    "css/modal.css",
    "css/shortcuts.css",
    "css/responsive.css",
}


def _safe_path_key(root):
    """Generate a filesystem-safe key from a resolved path.

    When the path is short, sanitizes it directly. For long paths, appends
    an MD5 digest to ensure uniqueness while staying within filesystem limits.

    Args:
        root: Resolved Path object.

    Returns:
        str: Safe string key for use in directory names.
    """
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", str(root).lstrip("/"))
    if len(safe) > 80:
        digest = hashlib.md5(str(root).encode()).hexdigest()[:8]
        safe = f"{root.name}_{digest}"
    return safe


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
    return Path.home() / ".cache" / "comicreader" / _safe_path_key(root)


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
        log.warning("无法读取索引 %s: %s", path, exc)
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

    Uses Path.resolve() to canonicalize both base and candidate, which
    follows symlinks to their real targets. A symlink inside base that
    points outside will resolve to a path whose parents do not include
    base, and will therefore be rejected.

    Args:
        base: Base directory path.
        rel: Relative path to join.

    Returns:
        str: Joined absolute path.

    Raises:
        ValueError: If traversal is detected or the resolved path
            escapes the base directory.
    """
    if "\x00" in rel:
        raise ValueError("null byte in path")
    base = Path(base).resolve()
    candidate = (base / rel).resolve()
    if candidate == base or base in candidate.parents:
        return str(candidate)
    raise ValueError(f"path traversal detected: {rel}")


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
    """Yield (source_path, relative_output_name) for all runtime assets.

    This is the single source of truth for what files get copied to the
    output directory and served via HTTP. CSS files are excluded because
    they are merged into a single file by copy_runtime_assets().
    """
    yield UMD_SRC, f"{VENDOR_DIR}/{UMD_FILE}"
    for name in [PDFJS_FILE, PDFJS_WORKER_FILE]:
        yield STATIC_DIR / PDFJS_DIR / name, f"{PDFJS_DIR}/{name}"
    yield STATIC_DIR / JS_FILE, JS_FILE
    modules_src = STATIC_DIR / MODULES_DIR
    if modules_src.exists():
        for f in sorted(modules_src.glob("*.js")):
            yield f, f"{MODULES_DIR}/{f.name}"


def remove_deprecated_runtime_assets(output_dir):
    removed = 0
    for rel_path in DEPRECATED_RUNTIME_ASSETS:
        target = output_dir / rel_path
        if target.is_file():
            target.unlink()
            removed += 1
    return removed

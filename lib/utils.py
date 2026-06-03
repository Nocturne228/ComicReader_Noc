"""Utility functions shared across modules."""
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
    name = re.sub(r'[\\/*?:"<>|]', "_", name).strip()
    return name or "cover"


def cover_filename(key):
    stem = sanitize_filename(Path(key).stem)[:80]
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    return f"{stem}-{digest}.jpg"


def quote_rel_path(key):
    return "../" + "/".join(quote(part) for part in key.split("/"))


def load_index(path):
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"警告: 无法读取索引 {path}: {exc}")
        return {}


def save_index(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def human_size(size):
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def safe_join(base, rel):
    base = Path(base).resolve()
    candidate = (base / rel).resolve()
    if candidate == base or base in candidate.parents:
        return str(candidate)
    return str(base / "__invalid_path__")


def build_allowed_output_paths(index):
    paths = {HTML_FILE, CSS_FILE, JS_FILE}
    paths.add(f"{VENDOR_DIR}/{UMD_FILE}")
    paths.update(f"{PDFJS_DIR}/{name}" for name in [PDFJS_FILE, PDFJS_WORKER_FILE])
    # Subdirectory modules (css/)
    css_dir = STATIC_DIR / "css"
    if css_dir.exists():
        for f in css_dir.glob("*.css"):
            paths.add(f"css/{f.name}")
    # Subdirectory modules (js/)
    js_dir = STATIC_DIR / "js"
    if js_dir.exists():
        for f in js_dir.glob("*.js"):
            paths.add(f"js/{f.name}")
    for info in index.values():
        image_name = info.get("image")
        if image_name:
            paths.add(f"images/{image_name}")
    return paths


def copy_if_changed(src, dst):
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
    # Yield JavaScript module files
    js_dir = STATIC_DIR / "js"
    if js_dir.exists():
        for f in sorted(js_dir.glob("*.js")):
            yield f, f"js/{f.name}"
    for name in [PDFJS_FILE, PDFJS_WORKER_FILE]:
        yield STATIC_DIR / PDFJS_DIR / name, f"{PDFJS_DIR}/{name}"

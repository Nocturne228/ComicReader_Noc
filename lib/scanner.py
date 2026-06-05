"""PDF file scanning, cover extraction, and index management.

This module handles scanning directories for PDF files, extracting cover images,
and managing the index file that tracks metadata for each PDF.
"""
import shutil
from pathlib import Path

from pdf2image import convert_from_path
from tqdm import tqdm

from lib.config import EXCLUDE_DIRS
from lib.utils import (
    copy_if_changed,
    cover_filename,
    iter_runtime_assets,
    load_index,
    save_index,
)


def find_pdf_files(root):
    """Find all PDF files in the given directory recursively.

    Args:
        root: Root directory to search for PDF files.

    Returns:
        list: Sorted list of PDF file paths.
    """
    return sorted(
        (p for p in root.rglob("*")
         if p.is_file() and p.suffix.lower() == ".pdf"
         and not any(d in p.parts for d in EXCLUDE_DIRS)),
        key=lambda p: p.relative_to(root).as_posix().lower(),
    )


def extract_first_page(pdf_path, img_path):
    """Extract the first page of a PDF file as a JPEG image.

    Args:
        pdf_path: Path to the PDF file.
        img_path: Output path for the extracted image.
    """
    convert_from_path(pdf_path, first_page=1, last_page=1, dpi=150)[0].save(
        img_path, "JPEG", quality=85
    )


def migrate_removed_entries(index, pdf_files, root, img_dir):
    """Migrate index entries for moved or renamed PDF files.

    This function handles the case where PDF files have been moved or renamed
    by matching them based on filename and modification time.

    Args:
        index: Index dictionary to update.
        pdf_files: List of current PDF file paths.
        root: Root directory path.
        img_dir: Directory containing cover images.

    Returns:
        tuple: (migrated_count, removed_count)
    """
    names = {p.relative_to(root).as_posix() for p in pdf_files}
    removed_entries = {}
    for old_key in list(index.keys()):
        if old_key not in names:
            removed_entries[old_key] = index.pop(old_key)

    migrated = 0
    for pdf in pdf_files:
        key = pdf.relative_to(root).as_posix()
        if key in index or not removed_entries:
            continue
        pdf_mtime = pdf.stat().st_mtime
        match = None
        for old_key, old_val in list(removed_entries.items()):
            if Path(old_key).name == pdf.name and abs(old_val.get("mtime", 0) - pdf_mtime) < 1e-6:
                match = (old_key, old_val)
                break
        if not match:
            continue

        old_key, old_val = match
        image_name = cover_filename(key)
        old_image = old_val.get("image")
        if old_image and old_image != image_name:
            old_path = img_dir / old_image
            new_path = img_dir / image_name
            if old_path.exists() and not new_path.exists():
                old_path.rename(new_path)
        index[key] = {"mtime": pdf_mtime, "image": image_name}
        del removed_entries[old_key]
        migrated += 1

    removed = 0
    for old_val in removed_entries.values():
        image_name = old_val.get("image")
        if image_name:
            image_path = img_dir / image_name
            if image_path.exists():
                image_path.unlink()
        removed += 1

    return migrated, removed


def process_cover_cache(pdf_files, root, img_dir, index):
    """Process cover images for all PDF files, updating cache as needed.

    This function extracts cover images for new or modified PDFs and
    manages the image cache to avoid redundant processing.

    Args:
        pdf_files: List of PDF file paths.
        root: Root directory path.
        img_dir: Directory for storing cover images.
        index: Index dictionary to update.

    Returns:
        tuple: (updated_count, skipped_count)
    """
    updated = 0
    skipped = 0

    for pdf in tqdm(pdf_files, desc="处理 PDF"):
        key = pdf.relative_to(root).as_posix()
        image_name = cover_filename(key)
        image_path = img_dir / image_name
        info = index.get(key)
        pdf_mtime = pdf.stat().st_mtime

        old_image = info.get("image") if info else None
        if info and old_image and old_image != image_name and abs(info.get("mtime", 0) - pdf_mtime) <= 1e-6:
            old_path = img_dir / old_image
            if old_path.exists() and not image_path.exists():
                old_path.rename(image_path)
            info["image"] = image_name

        changed = (
            info is None
            or abs(info.get("mtime", 0) - pdf_mtime) > 1e-6
            or info.get("image") != image_name
            or not image_path.exists()
        )

        if changed:
            try:
                extract_first_page(pdf, image_path)
                index[key] = {"mtime": pdf_mtime, "image": image_name}
                updated += 1
            except Exception as exc:
                print(f"  错误 {key}: {exc}")
        else:
            skipped += 1

    return updated, skipped


def copy_runtime_assets(output_dir):
    copied = 0
    # Core runtime files
    for src, name in iter_runtime_assets():
        if copy_if_changed(src, output_dir / name):
            copied += 1
    # Subdirectory: css/
    from lib.config import STATIC_DIR
    css_src = STATIC_DIR / "css"
    if css_src.exists():
        css_dst = output_dir / "css"
        css_dst.mkdir(exist_ok=True)
        for f in sorted(css_src.glob("*.css")):
            if copy_if_changed(f, css_dst / f.name):
                copied += 1
    return copied

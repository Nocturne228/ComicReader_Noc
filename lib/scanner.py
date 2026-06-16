"""PDF file scanning, cover extraction, and index management.

This module handles scanning directories for PDF files, extracting cover images,
and managing the index file that tracks metadata for each PDF.
"""
import logging
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from pdf2image import convert_from_path
from tqdm import tqdm

from lib.config import EXCLUDE_DIRS
from lib.utils import cover_filename

log = logging.getLogger(__name__)


def find_pdf_files(root):
    """Find all PDF files in the given directory recursively.

    Args:
        root: Root directory to search for PDF files.

    Returns:
        list: Sorted list of PDF file paths.
    """
    return sorted(
        (p for p in root.rglob("*.pdf")
         if p.is_file()
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


def _extract_worker(pdf_path_str, img_path_str):
    """Top-level worker function for ProcessPoolExecutor cover extraction.

    Args:
        pdf_path_str: String path to the PDF file.
        img_path_str: String path for the output image.

    Returns:
        tuple: (pdf_path_str, success_bool, error_message_or_None)
    """
    try:
        convert_from_path(pdf_path_str, first_page=1, last_page=1, dpi=150)[0].save(
            img_path_str, "JPEG", quality=85
        )
        return (pdf_path_str, True, None)
    except Exception as exc:
        return (pdf_path_str, False, str(exc))


def process_cover_cache(pdf_files, root, img_dir, index):
    """Process cover images for all PDF files, updating cache as needed.

    Uses ProcessPoolExecutor for parallel cover extraction on multi-core
    systems. Falls back to sequential extraction if parallel processing
    is unavailable or fails.

    Args:
        pdf_files: List of PDF file paths.
        root: Root directory path.
        img_dir: Directory for storing cover images.
        index: Index dictionary to update.

    Returns:
        tuple: (updated_count, skipped_count)
    """
    to_extract = []
    skipped = 0

    for pdf in pdf_files:
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
            to_extract.append((pdf, image_path, key, pdf_mtime, image_name))
        else:
            skipped += 1

    if not to_extract:
        return 0, skipped

    updated = 0
    try:
        max_workers = min(4, len(to_extract))
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            for pdf, image_path, key, pdf_mtime, image_name in to_extract:
                future = executor.submit(
                    _extract_worker, str(pdf), str(image_path)
                )
                futures[future] = (pdf, image_path, key, pdf_mtime, image_name)

            for future in tqdm(
                as_completed(futures),
                total=len(futures),
                desc="处理 PDF",
            ):
                pdf, image_path, key, pdf_mtime, image_name = futures[future]
                try:
                    _, success, error = future.result()
                    if success:
                        index[key] = {"mtime": pdf_mtime, "image": image_name}
                        updated += 1
                    else:
                        log.warning("封面提取失败 %s: %s", key, error)
                except Exception as exc:
                    log.warning("封面提取失败 %s: %s", key, exc)

    except Exception as exc:
        log.warning("并行提取不可用，回退到顺序模式: %s", exc)
        for pdf, image_path, key, pdf_mtime, image_name in tqdm(
            to_extract, desc="处理 PDF"
        ):
            try:
                extract_first_page(pdf, image_path)
                index[key] = {"mtime": pdf_mtime, "image": image_name}
                updated += 1
            except Exception as exc2:
                log.warning("封面提取失败 %s: %s", key, exc2)

    return updated, skipped

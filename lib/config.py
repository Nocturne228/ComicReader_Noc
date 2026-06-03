"""Project-wide constants and paths."""
from pathlib import Path

INDEX_FILE = "catalog_index.json"
HTML_FILE = "catalog.html"
UMD_FILE = "ComicReader.umd.js"
CSS_FILE = "catalog.css"
JS_FILE = "catalog.js"
PDFJS_DIR = "vendor/pdfjs"
PDFJS_FILE = "pdf.min.mjs"
PDFJS_WORKER_FILE = "pdf.worker.min.mjs"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = PROJECT_ROOT / "templates"
STATIC_DIR = PROJECT_ROOT / "static"
UMD_SRC = PROJECT_ROOT / UMD_FILE

EXCLUDE_DIRS = {"x_backup", "y_backup", "temp"}

"""Project-wide constants and paths.

This module defines all project-wide constants, file paths, and configuration
values used throughout the ComicReadScript application.
"""
from pathlib import Path

INDEX_FILE = "catalog_index.json"
HTML_FILE = "catalog.html"
UMD_FILE = "ComicReader.umd.js"
CSS_FILE = "catalog.css"
JS_FILE = "app.js"
VENDOR_DIR = "vendor"
MODULES_DIR = "modules"
PDFJS_DIR = f"{VENDOR_DIR}/pdfjs"
PDFJS_FILE = "pdf.min.mjs"
PDFJS_WORKER_FILE = "pdf.worker.min.mjs"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = PROJECT_ROOT / "templates"
STATIC_DIR = PROJECT_ROOT / "static"
UMD_SRC = STATIC_DIR / VENDOR_DIR / UMD_FILE

EXCLUDE_DIRS = {"temp"}

TOKEN_FILE = ".catalog_token"

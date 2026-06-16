"""Project-wide constants and paths.

This module defines all project-wide constants, file paths, and configuration
values used throughout the ComicReadScript application.
"""
import json
import logging
from pathlib import Path

log = logging.getLogger(__name__)

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

USER_CONFIG_DIR = Path.home() / ".comicreader"
USER_CONFIG_FILE = USER_CONFIG_DIR / "config.json"

DEFAULT_USER_CONFIG = {
    "folder": "",
    "host": "127.0.0.1",
    "port": 8080,
    "serve": True,
    "range_support": True,
    "output_dir": "",
}


def load_user_config(path=None):
    """Load user configuration from a JSON file.

    Args:
        path: Custom config file path. Defaults to ~/.comicreader/config.json.

    Returns:
        dict: Configuration values, merged with defaults for missing keys.
    """
    config_path = Path(path) if path else USER_CONFIG_FILE
    if not config_path.exists():
        return dict(DEFAULT_USER_CONFIG)
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return dict(DEFAULT_USER_CONFIG)
        merged = dict(DEFAULT_USER_CONFIG)
        merged.update({k: v for k, v in data.items() if k in DEFAULT_USER_CONFIG})
        return merged
    except Exception as exc:
        log.warning("无法读取配置文件 %s: %s", config_path, exc)
        return dict(DEFAULT_USER_CONFIG)


def save_user_config(config, path=None):
    """Save user configuration to a JSON file.

    Args:
        config: Configuration dict to save.
        path: Custom config file path. Defaults to ~/.comicreader/config.json.
    """
    config_path = Path(path) if path else USER_CONFIG_FILE
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import secrets
import shutil
import sys
import time
import webbrowser
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Event, Lock, Thread
from urllib.parse import quote, unquote, urlsplit

from jinja2 import Environment, FileSystemLoader, select_autoescape
from pdf2image import convert_from_path
from tqdm import tqdm

INDEX_FILE = "catalog_index.json"
HTML_FILE = "catalog.html"
UMD_FILE = "ComicReader.umd.js"
CSS_FILE = "catalog.css"
JS_FILE = "catalog.js"
PDFJS_DIR = "vendor/pdfjs"
PDFJS_FILE = "pdf.min.mjs"
PDFJS_WORKER_FILE = "pdf.worker.min.mjs"

PROJECT_ROOT = Path(__file__).parent.resolve()
TEMPLATE_DIR = PROJECT_ROOT / "templates"
STATIC_DIR = PROJECT_ROOT / "static"
UMD_SRC = PROJECT_ROOT / UMD_FILE

try:
    sys.stdout.reconfigure(line_buffering=True, write_through=True)
    sys.stderr.reconfigure(line_buffering=True, write_through=True)
except AttributeError:
    pass


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


def extract_first_page(pdf_path, img_path):
    convert_from_path(pdf_path, first_page=1, last_page=1, dpi=150)[0].save(
        img_path, "JPEG", quality=85
    )


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
    yield UMD_SRC, UMD_FILE
    yield STATIC_DIR / CSS_FILE, CSS_FILE
    yield STATIC_DIR / JS_FILE, JS_FILE
    for name in [PDFJS_FILE, PDFJS_WORKER_FILE]:
        yield STATIC_DIR / PDFJS_DIR / name, f"{PDFJS_DIR}/{name}"


def copy_runtime_assets(output_dir):
    copied = 0
    for src, name in iter_runtime_assets():
        if copy_if_changed(src, output_dir / name):
            copied += 1
    return copied


def find_pdf_files(root):
    return sorted(
        (p for p in root.rglob("*") if p.is_file() and p.suffix.lower() == ".pdf"),
        key=lambda p: p.relative_to(root).as_posix().lower(),
    )


def build_tree_data(indexed_pdfs, root):
    """将 PDF 列表转为嵌套树结构, 索引对应该列表位置。"""
    pdf_idx = {pdf: i for i, pdf in enumerate(indexed_pdfs)}
    tree = {}

    for pdf in sorted(indexed_pdfs, key=lambda p: p.relative_to(root).as_posix().lower()):
        rel = pdf.relative_to(root)
        node = tree
        for part in rel.parts[:-1]:
            node = node.setdefault(part, {})
        node.setdefault("__files", []).append(pdf)

    def convert(node, name, folder=""):
        entries = [
            {
                "name": p.name,
                "type": "pdf",
                "index": pdf_idx[p],
                "folder": str(p.relative_to(root).parent) or ".",
            }
            for p in node.get("__files", [])
        ]
        children = [
            convert(v, k, k if not folder else f"{folder}/{k}")
            for k, v in sorted(node.items())
            if k != "__files"
        ]
        if name == "root" and entries and children:
            uncategorized = {
                "name": "未分类",
                "type": "dir",
                "folder": "",
                "expanded": False,
                "children": entries,
            }
            return {
                "name": "全部",
                "type": "dir",
                "folder": "",
                "expanded": False,
                "children": [uncategorized] + children,
            }
        return {
            "name": name,
            "type": "dir",
            "folder": "" if name == "root" else folder,
            "expanded": False,
            "children": entries + children,
        }

    return convert(tree, "root")


def group_sort_key(pdf, root):
    rel = pdf.relative_to(root)
    parts = rel.parts
    return (len(parts) > 1, str(rel.parent).lower() if len(parts) > 1 else "", rel.name.lower())


def generate_html(pdf_files, index, html_path, base_url, root, shutdown_token=None):
    sorted_pdfs = sorted(
        (p for p in pdf_files if p.relative_to(root).as_posix() in index),
        key=lambda p: group_sort_key(p, root),
    )

    groups = {}
    indexed_pdfs = []
    for idx, pdf in enumerate(sorted_pdfs):
        rel = pdf.relative_to(root)
        folder = "" if str(rel.parent) == "." else str(rel.parent)
        groups.setdefault(folder, []).append((pdf, idx))
        indexed_pdfs.append(pdf)

    folder_groups = []
    for folder in sorted(groups, key=lambda f: (f != "", f.lower())):
        items = []
        for pdf, idx in groups[folder]:
            key = pdf.relative_to(root).as_posix()
            st = pdf.stat()
            items.append(
                {
                    "title": pdf.stem,
                    "index": idx,
                    "image": f"images/{index[key]['image']}",
                    "pdf_rel": quote_rel_path(key),
                    "size": human_size(st.st_size),
                    "mtime": st.st_mtime,
                    "mtime_text": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                }
            )
        label = folder if folder else "未分类"
        folder_groups.append({"folder": folder, "label": label, "cards": items})

    tree_data = build_tree_data(indexed_pdfs, root)
    tree = tree_data["children"] if tree_data.get("children") else [tree_data]
    catalog_config = {
        "tree": tree,
        "umdPath": UMD_FILE,
        "renderConcurrency": 4,
        "title": "Nocturne Manga",
        "serverControl": bool(base_url),
        "shutdownPath": "/__shutdown",
        "refreshPath": "/__refresh",
        "shutdownToken": shutdown_token or "",
        "pdfjsLocalPath": f"{PDFJS_DIR}/{PDFJS_FILE}",
        "pdfjsWorkerPath": f"{PDFJS_DIR}/{PDFJS_WORKER_FILE}",
    }

    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml", "j2"]),
    )
    template = env.get_template("catalog.html.j2")
    html = template.render(
        folder_groups=folder_groups,
        catalog_config=catalog_config,
        css_path=CSS_FILE,
        js_path=JS_FILE,
        base_url=base_url,
        total_count=len(indexed_pdfs),
    )
    html_path.write_text(html, encoding="utf-8")


def safe_join(base, rel):
    base = Path(base).resolve()
    candidate = (base / rel).resolve()
    if candidate == base or base in candidate.parents:
        return str(candidate)
    return str(base / "__invalid_path__")


def build_allowed_output_paths(index):
    paths = {HTML_FILE, UMD_FILE, CSS_FILE, JS_FILE}
    paths.update(f"{PDFJS_DIR}/{name}" for name in [PDFJS_FILE, PDFJS_WORKER_FILE])
    for info in index.values():
        image_name = info.get("image")
        if image_name:
            paths.add(f"images/{image_name}")
    return paths


def start_http_server(pdf_root, output_dir, host, port, state, shutdown_token, base_url):
    """HTTP 服务: /output/* 映射到缓存目录, 其它路径映射到 PDF 根目录。"""
    shutdown_requested = Event()
    refresh_lock = Lock()

    class CatalogHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(pdf_root), **kwargs)

        def check_control_request(self):
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self.send_error(403, "control actions are only allowed from localhost")
                return False
            token = self.headers.get("X-ComicReader-Token", "")
            if not secrets.compare_digest(token, shutdown_token):
                self.send_error(403, "invalid control token")
                return False
            return True

        def send_json(self, status, data):
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            request_path = urlsplit(self.path).path
            if request_path == "/__shutdown":
                if not self.check_control_request():
                    return
                self.send_json(200, {"ok": True, "message": "server shutting down"})
                shutdown_requested.set()
                Thread(target=self.server.shutdown, daemon=True).start()
                return

            if request_path == "/__refresh":
                if not self.check_control_request():
                    return
                if not refresh_lock.acquire(blocking=False):
                    self.send_json(409, {"ok": False, "message": "refresh already running"})
                    return
                try:
                    result = rebuild_catalog(
                        pdf_root,
                        output_dir,
                        base_url=base_url,
                        shutdown_token=shutdown_token,
                        allow_empty=True,
                    )
                    with state["lock"]:
                        state["allowed_pdf_paths"] = result["allowed_pdf_paths"]
                        state["allowed_output_paths"] = result["allowed_output_paths"]
                    self.send_json(200, {"ok": True, "stats": result["stats"]})
                    print(f"  [REFRESH] {format_stats(result['stats'])}", flush=True)
                except Exception as exc:
                    self.send_json(500, {"ok": False, "message": str(exc)})
                    print(f"  [REFRESH] 错误: {exc}", flush=True)
                finally:
                    refresh_lock.release()
                return

            self.send_error(404)

        def translate_path(self, path):
            request_path = unquote(urlsplit(path).path, errors="surrogatepass")
            rel = request_path.lstrip("/")

            with state["lock"]:
                allowed_output_paths = set(state["allowed_output_paths"])
                allowed_pdf_paths = set(state["allowed_pdf_paths"])

            if rel.startswith("output/"):
                output_rel = rel.split("/", 1)[1]
                if output_rel in allowed_output_paths:
                    return safe_join(output_dir, output_rel)
                return safe_join(output_dir, "__not_allowed__")
            if rel in allowed_output_paths:
                return safe_join(output_dir, rel)
            if rel in allowed_pdf_paths:
                return safe_join(pdf_root, rel)
            return safe_join(pdf_root, "__not_allowed__")

        def list_directory(self, path):
            self.send_error(403, "directory listing is disabled")
            return None

        def log_message(self, fmt, *args):
            print(f"  [HTTP] {unquote(fmt % args)}")

    server = HTTPServer((host, port), CatalogHandler)
    server.shutdown_requested = shutdown_requested
    Thread(target=server.serve_forever, daemon=True).start()
    return server


def default_cache_dir(pdf_root):
    root = str(pdf_root)
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", root.lstrip("/"))
    if len(safe) > 80:
        digest = hashlib.md5(root.encode()).hexdigest()[:8]
        safe = f"{Path(pdf_root).name}_{digest}"
    return Path.home() / ".cache" / "comicreader" / safe


def migrate_removed_entries(index, pdf_files, root, img_dir):
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


def rebuild_catalog(root, out, base_url=None, shutdown_token=None, allow_empty=False):
    img_dir = out / "images"
    out.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(exist_ok=True)

    index_path = out / INDEX_FILE
    html_path = out / HTML_FILE
    index = load_index(index_path)
    pdf_files = find_pdf_files(root)
    if not pdf_files and not allow_empty:
        return None

    migrated, removed = migrate_removed_entries(index, pdf_files, root, img_dir)
    updated, skipped = process_cover_cache(pdf_files, root, img_dir, index)
    copied_assets = copy_runtime_assets(out)

    save_index(index_path, index)
    generate_html(pdf_files, index, html_path, base_url, root, shutdown_token=shutdown_token)

    stats = {
        "pdf": len(pdf_files),
        "covers": sum(1 for _ in img_dir.glob("*.jpg")),
        "updated": updated,
        "skipped": skipped,
        "migrated": migrated,
        "removed": removed,
        "assets": copied_assets,
        "html": str(html_path),
        "cache": str(out),
    }
    return {
        "stats": stats,
        "index": index,
        "pdf_files": pdf_files,
        "allowed_pdf_paths": set(index.keys()),
        "allowed_output_paths": build_allowed_output_paths(index),
    }


def format_stats(stats):
    parts = [
        f"PDF: {stats['pdf']}",
        f"封面: {stats['covers']}",
        f"新增/更新: {stats['updated']}",
    ]
    for key, label in [
        ("skipped", "跳过"),
        ("migrated", "移动"),
        ("removed", "移除"),
        ("assets", "资源更新"),
    ]:
        if stats.get(key):
            parts.append(f"{label}: {stats[key]}")
    return ", ".join(parts)


def process_folder(folder, serve=False, host="127.0.0.1", port=8080, output_dir=None):
    root = Path(folder).expanduser().resolve()
    if not root.is_dir():
        print(f"错误: 文件夹不存在: {root}")
        sys.exit(1)

    out = Path(output_dir).expanduser().resolve() if output_dir else default_cache_dir(root)
    display_host = "localhost" if host in {"127.0.0.1", "::1"} else host
    base_url = f"http://{display_host}:{port}" if serve else None
    shutdown_token = secrets.token_urlsafe(24) if serve else None
    result = rebuild_catalog(root, out, base_url=base_url, shutdown_token=shutdown_token)
    if result is None:
        print("未找到 PDF 文件")
        sys.exit(0)

    stats = result["stats"]
    print(f"\n  {format_stats(stats)}", flush=True)
    print(f"  HTML: {stats['html']}", flush=True)
    print(f"  缓存: {out}", flush=True)

    if serve:
        url = f"http://{display_host}:{port}/output/{HTML_FILE}"
        state = {
            "lock": Lock(),
            "allowed_pdf_paths": result["allowed_pdf_paths"],
            "allowed_output_paths": result["allowed_output_paths"],
        }
        server = start_http_server(
            root,
            out,
            host,
            port,
            state,
            shutdown_token,
            base_url,
        )
        print(f"  -> {url}", flush=True)
        try:
            webbrowser.open(url)
        except Exception as exc:
            print(f"  浏览器未自动打开: {exc}")
        try:
            while not server.shutdown_requested.wait(3600):
                pass
            print("\n已从网页端关闭", flush=True)
        except KeyboardInterrupt:
            print("\n已停止", flush=True)
            server.shutdown()


def parse_args():
    parser = argparse.ArgumentParser(description="Nocturne Manga - 配合 ComicRead 阅读器在线阅读 PDF")
    parser.add_argument("folder", help="PDF 文件夹路径")
    parser.add_argument("--serve", "-s", action="store_true", help="启动 HTTP 服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址 (默认: 127.0.0.1)")
    parser.add_argument("--port", "-p", type=int, default=8080, help="端口 (默认: 8080)")
    parser.add_argument("--output-dir", "-o", default=None, help="缓存目录 (默认: ~/.cache/comicreader/<路径>)")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    process_folder(
        args.folder,
        serve=args.serve,
        host=args.host,
        port=args.port,
        output_dir=args.output_dir,
    )

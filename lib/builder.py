"""HTML catalog generation and directory tree building."""
import sys
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from lib.config import (
    CSS_FILE,
    HTML_FILE,
    INDEX_FILE,
    JS_FILE,
    PDFJS_DIR,
    PDFJS_FILE,
    PDFJS_WORKER_FILE,
    TEMPLATE_DIR,
    VENDOR_DIR,
    UMD_FILE,
)
from lib.scanner import (
    copy_runtime_assets,
    find_pdf_files,
    load_index,
    migrate_removed_entries,
    process_cover_cache,
    save_index,
)
from lib.tag_manager import load_tags, reconcile_tags
from lib.utils import (
    build_allowed_output_paths,
    human_size,
    quote_rel_path,
)


def build_tree_data(indexed_pdfs, root):
    """将 PDF 列表转为嵌套树结构, 索引对应该列表位置。"""
    pdf_idx = {pdf: i for i, pdf in enumerate(indexed_pdfs)}
    tree = {}

    for pdf in sorted(indexed_pdfs, key=lambda p: group_sort_key(p, root)):
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
                "folder": "" if str(p.relative_to(root).parent) == "." else str(p.relative_to(root).parent),
            }
            for p in node.get("__files", [])
        ]
        children = [
            convert(v, k, k if not folder else f"{folder}/{k}")
            for k, v in sorted(node.items(), key=lambda x: (x[0] != "", x[0].lower()))
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


def build_tool_folder_groups(tree, work_dir=None):
    """Build tool target groups for workspace and library scopes."""
    groups = []
    if work_dir:
        work_dir = Path(work_dir)
        workspace_folders = []
        for name, label in [("temp", "temp/"), ("exports", "exports/")]:
            if (work_dir / name).is_dir():
                workspace_folders.append({"scope": "workspace", "folder": name, "label": label})
        if workspace_folders:
            groups.append({"label": "工作区", "folders": workspace_folders})

    library_folders = [{"scope": "library", "folder": "", "label": "/"}]

    def collect(nodes):
        for node in nodes:
            if node.get("type") == "dir":
                folder = node.get("folder", "")
                name = node.get("name", folder or "/")
                if folder:
                    library_folders.append({"scope": "library", "folder": folder, "label": name})
                collect(node.get("children", []))

    collect(tree)
    groups.append({"label": "漫画库", "folders": library_folders})
    return groups


def generate_html(
    pdf_files,
    index,
    html_path,
    base_url,
    root,
    shutdown_token=None,
    range_support=True,
    work_dir=None,
):
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
    native_open_enabled = bool(base_url) and sys.platform == "darwin"
    catalog_config = {
        "tree": tree,
        "toolFolderGroups": build_tool_folder_groups(tree, work_dir),
        "umdPath": f"{VENDOR_DIR}/{UMD_FILE}",
        "renderConcurrency": 2,
        "enablePerf": False,
        "initialRenderPages": 3,
        "pixelRatio": 2,
        "title": "Nocturne Manga",
        "serverControl": bool(base_url),
        "shutdownPath": "/__shutdown",
        "refreshPath": "/__refresh",
        "nativeOpenPath": "/__open_native",
        "nativeOpenEnabled": native_open_enabled,
        "shutdownToken": shutdown_token or "",
        "toolRunPath": "/__tool_run",
        "toolOpenPath": "/__tool_open",
        "restartPath": "/__restart",
        "tagsGetPath": "/__tags_get",
        "tagUpdatePath": "/__tag_update",
        "tagRenamePath": "/__tag_rename",
        "tagDeletePath": "/__tag_delete",
        "tagsEnabled": bool(base_url),
        "tagsData": load_tags(html_path.parent),
        "pdfjsLocalPath": f"{PDFJS_DIR}/{PDFJS_FILE}",
        "pdfjsWorkerPath": f"{PDFJS_DIR}/{PDFJS_WORKER_FILE}",
        "rangeSupport": range_support,
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


def rebuild_catalog(
    root,
    out,
    base_url=None,
    shutdown_token=None,
    allow_empty=False,
    range_support=True,
    work_dir=None,
):
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
    _, tag_migrated, tag_removed = reconcile_tags(out, pdf_files, root)
    copied_assets = copy_runtime_assets(out)

    save_index(index_path, index)
    generate_html(
        pdf_files,
        index,
        html_path,
        base_url,
        root,
        shutdown_token=shutdown_token,
        range_support=range_support,
        work_dir=work_dir,
    )

    stats = {
        "pdf": len(pdf_files),
        "covers": sum(1 for _ in img_dir.glob("*.jpg")),
        "updated": updated,
        "skipped": skipped,
        "migrated": migrated,
        "removed": removed,
        "tag_migrated": tag_migrated,
        "tag_removed": tag_removed,
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
        ("tag_migrated", "标签移动"),
        ("tag_removed", "标签移除"),
        ("assets", "资源更新"),
    ]:
        if stats.get(key):
            parts.append(f"{label}: {stats[key]}")
    return ", ".join(parts)

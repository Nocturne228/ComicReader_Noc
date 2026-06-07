#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PDF page manipulation tool.

This script provides batch operations on PDF pages, including deletion,
extraction of individual pages as PNG, and extraction of page ranges.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from pdf2image import convert_from_path
from pypdf import PdfReader, PdfWriter
from tqdm import tqdm

# =====================================================
# 全局配置
# =====================================================

# 需要排除的备份目录名称
EXCLUDE_DIRS = {"x_backup", "y_backup"}

# DPI 预设：黑白默认使用更高分辨率，彩色控制输出体积
DPI_PRESETS = {"color": 300, "bw": 600}


def resolve_dpi(mode):
    """Map a user-facing DPI mode to actual DPI value."""
    return DPI_PRESETS.get(mode, DPI_PRESETS["bw"])


# =====================================================
# 核心功能：单文件处理
# =====================================================


def delete_pdf_pages(
    input_path, output_path, single=None, range_count=None, from_back=False
):
    """Delete pages from a single PDF file.

    Args:
        input_path: Path to input PDF file.
        output_path: Path to output PDF file.
        single: Page number to delete (1-indexed).
        range_count: Number of consecutive pages to delete.
        from_back: If True, count pages from the end.

    Returns:
        bool: True if successful, False if error occurred.
    """
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()
        total_pages = len(reader.pages)

        pages_to_delete = set()

        # 模式 1：删除单页
        if single is not None:
            if from_back:
                idx = total_pages - single
            else:
                idx = single - 1

            if 0 <= idx < total_pages:
                pages_to_delete.add(idx)
            else:
                raise ValueError(
                    f"指定页码 {single} 超出文件总页数范围（当前文件共 {total_pages} 页）"
                )

        # 模式 2：删除连续多页
        elif range_count is not None:
            if range_count >= total_pages:
                raise ValueError(
                    f"删除页数 {range_count} 大于或等于总页数（{total_pages} 页），拒绝清空整个文件"
                )

            if from_back:
                for i in range(total_pages - range_count, total_pages):
                    pages_to_delete.add(i)
            else:
                for i in range(0, range_count):
                    pages_to_delete.add(i)

        # 重新组装
        for i in range(total_pages):
            if i not in pages_to_delete:
                writer.add_page(reader.pages[i])

        with open(output_path, "wb") as f:
            writer.write(f)
        return True
    except Exception as e:
        print(f"\n[错误] 文件 {input_path.name} 页面裁剪失败: {e}", flush=True)
        return False


def extract_pdf_page_to_png(pdf_path, page_number, output_path=None, dpi=300):
    """Extract one PDF page as a PNG image."""
    pdf_path = Path(pdf_path).expanduser().resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF 文件不存在: {pdf_path}")
    if page_number < 1:
        raise ValueError("页码必须大于 0")

    total_pages = len(PdfReader(pdf_path).pages)
    if page_number > total_pages:
        raise ValueError(f"指定页码 {page_number} 超出范围（当前文件共 {total_pages} 页）")

    output_path = Path(output_path) if output_path else pdf_path.with_name(
        f"{pdf_path.stem}_page_{page_number}.png"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    images = convert_from_path(
        pdf_path, dpi=dpi, first_page=page_number, last_page=page_number
    )
    if not images:
        raise ValueError(f"未能提取第 {page_number} 页")

    images[0].save(output_path, "PNG")
    print(f"已保存: {output_path}", flush=True)
    return output_path


def extract_pdf_pages_range(pdf_path, start_page, end_page, output_path=None):
    """Extract a page range from one PDF into a standalone PDF."""
    pdf_path = Path(pdf_path).expanduser().resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF 文件不存在: {pdf_path}")

    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    if start_page < 1 or end_page > total_pages or start_page > end_page:
        raise ValueError(
            f"页码范围无效。PDF 共有 {total_pages} 页，请输入有效范围 (1-{total_pages})"
        )

    output_path = Path(output_path) if output_path else pdf_path.with_name(
        f"{pdf_path.stem}_pages_{start_page}-{end_page}.pdf"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    writer = PdfWriter()
    for page_index in range(start_page - 1, end_page):
        writer.add_page(reader.pages[page_index])

    with open(output_path, "wb") as output_file:
        writer.write(output_file)

    print(f"已保存: {output_path} (第 {start_page} 到 {end_page} 页)", flush=True)
    return output_path


# =====================================================
# 文件夹批处理
# =====================================================


def process_pdf_files(all_files, single=None, range_count=None, from_back=False):
    """Delete pages from selected PDF files with per-folder backup protection."""
    if not all_files:
        print("未找到需要处理的 PDF 文件。", flush=True)
        return

    all_files = sorted(all_files)

    print("=" * 48, flush=True)
    print(f"  方向: {'【从后往前数】' if from_back else '【从前往后数】'}", flush=True)
    if single is not None:
        print(f"  动作: 删除第 {single} 页", flush=True)
    else:
        print(f"  动作: 删除连续的 {range_count} 页", flush=True)
    print(f"  PDF 数量: {len(all_files)}", flush=True)
    print("=" * 48, flush=True)
    print("", flush=True)

    success_count = 0
    skipped_count = 0
    failed_count = 0

    for pdf_path in tqdm(all_files, desc="批量剪裁中"):
        # 在当前 PDF 同级目录下创建独立备份目录
        current_backup_dir = pdf_path.parent / "y_backup"
        backup_path = current_backup_dir / pdf_path.name

        # 幂等性：备份目录中已存在同名原文件则跳过
        if backup_path.exists():
            print(f"\n[跳过] 开启保护：{pdf_path.name}", flush=True)
            print(
                f"       -> 原因：专属备份目录 {current_backup_dir.name}/ 中已存在同名原文件", flush=True
            )
            skipped_count += 1
            continue

        try:
            current_backup_dir.mkdir(exist_ok=True)

            # 1. 原文件移至备份目录
            pdf_path.rename(backup_path)

            # 2. 从备份读取，处理输出至原路径
            status = delete_pdf_pages(
                input_path=backup_path,
                output_path=pdf_path,
                single=single,
                range_count=range_count,
                from_back=from_back,
            )

            if status:
                success_count += 1
            else:
                failed_count += 1
                # 失败回滚
                if backup_path.exists():
                    backup_path.rename(pdf_path)

        except Exception as e:
            failed_count += 1
            print(f"\n[系统异常] 无法安全备份或处理 {pdf_path.name}: {e}", flush=True)
            if backup_path.exists() and not pdf_path.exists():
                backup_path.rename(pdf_path)

    print("", flush=True)
    print("=" * 48, flush=True)
    print("  任务执行完毕报告", flush=True)
    print("=" * 48, flush=True)
    print(f"  文件总数 : {len(all_files)}", flush=True)
    print(f"  成功处理 : {success_count}（原名保存）", flush=True)
    print(f"  安全跳过 : {skipped_count}（备份目录已存在原文件）", flush=True)
    print(f"  处理失败 : {failed_count}", flush=True)
    print("=" * 48, flush=True)


def resolve_pdf_file(root, file_arg):
    """Resolve a selected PDF path under the target folder."""
    if not file_arg:
        raise ValueError("需要指定 --file")
    root = Path(root).expanduser().resolve()
    candidate = Path(file_arg).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("PDF 文件必须位于目标文件夹内") from exc
    if not candidate.is_file() or candidate.suffix.lower() != ".pdf":
        raise FileNotFoundError(f"PDF 文件不存在: {candidate}")
    if any(d in candidate.parts for d in EXCLUDE_DIRS):
        raise ValueError("不能处理备份目录中的 PDF 文件")
    return candidate


def process_folder(folder_path, single=None, range_count=None, from_back=False):
    """批量处理指定文件夹中的所有 PDF"""
    root = Path(folder_path).expanduser().resolve()

    if not root.exists() or not root.is_dir():
        print(f"[错误] 无效的文件夹路径 -> {root}", flush=True)
        return

    # 扫描 PDF，排除备份目录
    all_files = [
        p for p in root.rglob("*.pdf") if not any(d in p.parts for d in EXCLUDE_DIRS)
    ]

    print(f"  扫描目录: {root}", flush=True)
    process_pdf_files(all_files, single, range_count, from_back)


def process_file(folder_path, file_arg, single=None, range_count=None, from_back=False):
    """Delete pages from one selected PDF file under a folder."""
    root = Path(folder_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"[错误] 无效的文件夹路径 -> {root}", flush=True)
        return
    pdf_path = resolve_pdf_file(root, file_arg)
    print(f"  指定文件: {pdf_path.relative_to(root)}", flush=True)
    process_pdf_files([pdf_path], single, range_count, from_back)


def resolve_output_path(root, pdf_path, output_arg, default_name):
    """Resolve extraction output under the target folder."""
    if not output_arg:
        return pdf_path.with_name(default_name)
    root = Path(root).expanduser().resolve()
    output = Path(output_arg).expanduser()
    if not output.is_absolute():
        output = pdf_path.parent / output
    output = output.resolve()
    try:
        output.relative_to(root)
    except ValueError as exc:
        raise ValueError("输出路径必须位于目标文件夹内") from exc
    return output


def process_extract_png(folder_path, file_arg, page_number, output_arg=None, dpi=300):
    """Extract one page from a selected PDF as PNG."""
    root = Path(folder_path).expanduser().resolve()
    pdf_path = resolve_pdf_file(root, file_arg)
    output_path = resolve_output_path(
        root, pdf_path, output_arg, f"{pdf_path.stem}_page_{page_number}.png"
    )
    return extract_pdf_page_to_png(pdf_path, page_number, output_path, dpi=dpi)


def process_extract_pdf(folder_path, file_arg, start_page, end_page, output_arg=None):
    """Extract a page range from a selected PDF as PDF."""
    root = Path(folder_path).expanduser().resolve()
    pdf_path = resolve_pdf_file(root, file_arg)
    output_path = resolve_output_path(
        root, pdf_path, output_arg, f"{pdf_path.stem}_pages_{start_page}-{end_page}.pdf"
    )
    return extract_pdf_pages_range(pdf_path, start_page, end_page, output_path)


# =====================================================
# 命令行入口
# =====================================================


def open_folder(folder_path):
    """用默认文件管理器打开指定目录"""
    path = Path(folder_path).expanduser().resolve()
    if not path.is_dir():
        print(f"目录不存在: {path}", flush=True)
        return
    if sys.platform == "darwin":
        subprocess.run(["open", str(path)], check=True)
    elif sys.platform == "win32":
        subprocess.run(["explorer", str(path)], check=True)
    else:
        subprocess.run(["xdg-open", str(path)], check=True)
    print(f"已打开: {path}", flush=True)


def clean_backups(folder_path):
    """递归清理所有 y_backup 备份目录"""
    root = Path(folder_path).expanduser().resolve()
    dirs = sorted(root.rglob("y_backup"))
    if not dirs:
        print("未找到任何 y_backup 备份目录。", flush=True)
        return
    for d in dirs:
        shutil.rmtree(d)
        print(f"已删除备份目录: {d}", flush=True)
    print(f"\n共清理 {len(dirs)} 个 y_backup 备份目录。", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="PDF 页面处理工具：批量删除页面、提取单页 PNG、提取页码范围 PDF"
    )
    parser.add_argument("folder", type=str, help="PDF 文件夹路径")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "-s", "--single", type=int, help="删除指定的单个页码（从 1 开始算）"
    )
    group.add_argument("-r", "--range", type=int, help="删除连续的页数")
    group.add_argument(
        "--extract-png",
        type=int,
        metavar="PAGE",
        help="从指定 PDF 提取单页为 PNG（需配合 --file）",
    )
    group.add_argument(
        "--extract-pdf",
        nargs=2,
        type=int,
        metavar=("START", "END"),
        help="从指定 PDF 提取页码范围为 PDF（需配合 --file）",
    )
    parser.add_argument("-b", "--back", action="store_true", help="切换为从后往前数")
    parser.add_argument(
        "--file",
        help="只处理/提取指定 PDF 文件；可填写相对目标文件夹的路径",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="提取操作的输出路径；相对路径按源 PDF 所在目录解析",
    )
    parser.add_argument(
        "--dpi-mode",
        choices=sorted(DPI_PRESETS),
        default="bw",
        help="PNG 提取 DPI 预设：color=300，bw=600（默认 bw，仅 --extract-png 使用）",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="操作完成后用默认文件管理器打开目标目录",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="清理所有 y_backup 备份目录（不执行裁剪操作）",
    )

    args = parser.parse_args()

    if args.clean:
        clean_backups(args.folder)
        if args.open:
            open_folder(args.folder)
    elif args.extract_png is not None:
        try:
            dpi = resolve_dpi(args.dpi_mode)
            process_extract_png(
                args.folder, args.file, args.extract_png, args.output, dpi=dpi
            )
        except Exception as exc:
            print(f"[错误] {exc}", flush=True)
            sys.exit(1)
        if args.open:
            open_folder(args.folder)
    elif args.extract_pdf is not None:
        try:
            start_page, end_page = args.extract_pdf
            process_extract_pdf(args.folder, args.file, start_page, end_page, args.output)
        except Exception as exc:
            print(f"[错误] {exc}", flush=True)
            sys.exit(1)
        if args.open:
            open_folder(args.folder)
    else:
        if args.single is None and args.range is None:
            parser.error(
                "请指定 -s/--single、-r/--range、--extract-png、--extract-pdf 或 --clean"
            )
        try:
            if args.file:
                process_file(args.folder, args.file, args.single, args.range, args.back)
            else:
                process_folder(args.folder, args.single, args.range, args.back)
        except Exception as exc:
            print(f"[错误] {exc}", flush=True)
            sys.exit(1)
        if args.open:
            open_folder(args.folder)

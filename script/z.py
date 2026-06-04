#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ZIP to PDF conversion tool.

This script converts ZIP archives containing images into PDF files,
with support for different DPI presets for black-and-white or color content.
"""

import argparse
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from tqdm import tqdm

# =====================================================
# 全局配置
# =====================================================

# 需要排除的备份目录名称（当前为预留，后续扩展用）
EXCLUDE_DIRS = {"x_backup", "y_backup"}

# 支持的图片格式
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

# DPI 预设：黑白默认使用更高分辨率，彩色控制输出体积
DPI_PRESETS = {"bw": 600, "color": 300}


# =====================================================
# 工具函数
# =====================================================


def natural_key(p: Path):
    """Generate a natural sort key for files.

    This enables natural sorting where 'img2' comes before 'img10'.

    Args:
        p: Path to generate sort key for.

    Returns:
        list: Sort key components.
    """
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", p.name)]


def safe_extract(zip_path: Path, out_dir: Path):
    """Safely extract a ZIP archive, handling encoding issues.

    Args:
        zip_path: Path to the ZIP archive.
        out_dir: Output directory for extracted files.
    """
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            try:
                name = member.filename
                target = out_dir / name
                target.parent.mkdir(parents=True, exist_ok=True)

                with zf.open(member) as src, open(target, "wb") as dst:
                    dst.write(src.read())
            except Exception:
                continue


# =====================================================
# 图片收集
# =====================================================


def find_images(folder: Path):
    """Recursively find all supported image files in a folder.

    Args:
        folder: Directory to search for images.

    Returns:
        list: Sorted list of image file paths.
    """
    images = []
    for f in folder.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS:
            images.append(f)
    return sorted(images, key=natural_key)


# =====================================================
# 图片诊断
# =====================================================


def diagnose_image(path: Path):
    """Diagnose if an image file is valid.

    Args:
        path: Path to the image file.

    Returns:
        tuple: (is_valid, info_dict) where info_dict contains diagnostic details.
    """
    info = {
        "file": path.name,
        "size": path.stat().st_size if path.exists() else -1,
        "reason": None,
    }

    if not path.exists():
        info["reason"] = "文件不存在"
        return False, info

    if info["size"] == 0:
        info["reason"] = "空文件"
        return False, info

    try:
        r = subprocess.run(
            ["magick", "identify", str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        if r.returncode != 0:
            err = (r.stderr or "").lower()

            if "no decode delegate" in err:
                info["reason"] = "不支持的格式或缺少解码器"
            elif "corrupt" in err:
                info["reason"] = "图片文件损坏"
            elif "unable to open" in err:
                info["reason"] = "文件不存在或路径错误"
            else:
                info["reason"] = "ImageMagick 处理错误"

            return False, info

    except Exception as e:
        info["reason"] = f"异常: {type(e).__name__}"
        return False, info

    return True, info


# =====================================================
# 图片转 PDF
# =====================================================


def resolve_dpi(mode):
    """Map a user-facing DPI mode to ImageMagick density."""
    return DPI_PRESETS.get(mode, DPI_PRESETS["bw"])


def images_to_pdf(images, output_pdf: Path, dpi=600):
    """使用 ImageMagick 将多张图片合成一个 PDF"""
    if not images:
        return False

    cmd = [
        "magick",
        "-density",
        str(dpi),
        *[str(p) for p in images],
        "-auto-orient",
        "-units",
        "PixelsPerInch",
        "-density",
        str(dpi),
        "-colorspace",
        "sRGB",
        "-strip",
        "-quality",
        "92",
        str(output_pdf),
    ]

    try:
        subprocess.run(cmd, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[错误] ImageMagick 转换失败: {e}", flush=True)
        return False


# =====================================================
# 单个 ZIP 处理
# =====================================================


def process_zip(zip_path: Path, dpi=600):
    """处理单个 ZIP 文件：解压 → 诊断 → 合成 PDF"""
    print("", flush=True)
    print("=" * 48, flush=True)
    print(f"  处理: {zip_path.stem}", flush=True)
    print(f"  输出 DPI: {dpi}", flush=True)
    print("=" * 48, flush=True)

    output_pdf = zip_path.with_suffix(".pdf")

    with TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        # 解压
        safe_extract(zip_path, tmp)

        images = find_images(tmp)
        print(f"  图片总数: {len(images)}", flush=True)

        valid_images = []

        print("  正在检查图片...", flush=True)

        # 逐个诊断
        for img in images:
            ok, info = diagnose_image(img)

            if ok:
                valid_images.append(img)
            else:
                print(f"  [跳过] 无效图片: {info['file']}", flush=True)
                print(f"    ├─ 原因: {info['reason']}", flush=True)
                print(f"    └─ 大小: {info['size']} 字节", flush=True)

        if not valid_images:
            print("  [错误] 未找到有效图片，跳过。", flush=True)
            return False

        print(f"  有效图片: {len(valid_images)}", flush=True)

        return images_to_pdf(valid_images, output_pdf, dpi=dpi)


# =====================================================
# 文件夹批处理
# =====================================================


def resolve_zip_file(root, file_arg):
    """Resolve a selected ZIP path under the target folder."""
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
        raise ValueError("ZIP 文件必须位于目标文件夹内") from exc
    if not candidate.is_file() or candidate.suffix.lower() != ".zip":
        raise FileNotFoundError(f"ZIP 文件不存在: {candidate}")
    return candidate


def process_zip_files(zip_files, dpi=600):
    """Convert selected ZIP files to PDFs."""
    if not zip_files:
        print("  未找到任何 ZIP 文件。", flush=True)
        return

    zip_files = sorted(zip_files)

    print(f"  ZIP 文件数: {len(zip_files)}", flush=True)
    print(f"  输出 DPI: {dpi}", flush=True)

    success = 0

    for z in tqdm(zip_files, desc="ZIP 转 PDF 中"):
        if process_zip(z, dpi=dpi):
            success += 1

    print("", flush=True)
    print("=" * 48, flush=True)
    print("  任务执行完毕报告", flush=True)
    print("=" * 48, flush=True)
    print(f"  文件总数 : {len(zip_files)}", flush=True)
    print(f"  成功转换 : {success}", flush=True)
    print(f"  处理失败 : {len(zip_files) - success}", flush=True)
    print("=" * 48, flush=True)


def process_folder(folder_path, dpi=600):
    """扫描文件夹中的所有 ZIP 并逐个转换为 PDF"""
    root = Path(folder_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"[错误] 无效的文件夹路径 -> {root}", flush=True)
        return

    zip_files = sorted(root.glob("*.zip"))

    print(f"  扫描目录: {root}", flush=True)
    process_zip_files(zip_files, dpi=dpi)


def process_file(folder_path, file_arg, dpi=600):
    """Convert one selected ZIP file under a folder to PDF."""
    root = Path(folder_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"[错误] 无效的文件夹路径 -> {root}", flush=True)
        return
    zip_path = resolve_zip_file(root, file_arg)
    print(f"  指定文件: {zip_path.relative_to(root)}", flush=True)
    process_zip_files([zip_path], dpi=dpi)


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


def clean_zip_files(folder_path):
    """删除目标目录中的所有 ZIP 压缩文件"""
    root = Path(folder_path).expanduser().resolve()
    zips = sorted(root.glob("*.zip"))
    if not zips:
        print("未找到任何 ZIP 文件。", flush=True)
        return
    for z in zips:
        z.unlink()
        print(f"已删除: {z.name}", flush=True)
    print(f"\n共清理 {len(zips)} 个 ZIP 文件。", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ZIP 压缩包批量转 PDF 工具（基于 ImageMagick）"
    )
    parser.add_argument("folder", type=str, help="包含 ZIP 文件的文件夹路径")
    parser.add_argument(
        "--open",
        action="store_true",
        help="操作完成后用默认文件管理器打开目标目录",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="删除目标目录中的所有 ZIP 文件（不执行转换操作）",
    )
    parser.add_argument(
        "--dpi-mode",
        choices=sorted(DPI_PRESETS),
        default="bw",
        help="PDF 输出 DPI 预设：color=300，bw=600（默认 bw）",
    )
    parser.add_argument(
        "--file",
        help="只处理指定 ZIP 文件；可填写相对目标文件夹的路径",
    )

    args = parser.parse_args()
    dpi = resolve_dpi(args.dpi_mode)

    if args.clean:
        clean_zip_files(args.folder)
        if args.open:
            open_folder(args.folder)
    else:
        try:
            if args.file:
                process_file(args.folder, args.file, dpi=dpi)
            else:
                process_folder(args.folder, dpi=dpi)
        except Exception as exc:
            print(f"[错误] {exc}", flush=True)
            sys.exit(1)
        if args.open:
            open_folder(args.folder)

#!/usr/bin/env python3
# -*- coding: utf-8 -*-

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


# =====================================================
# 工具函数
# =====================================================


def natural_key(p: Path):
    """自然排序键：'img2' < 'img10'"""
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", p.name)]


def safe_extract(zip_path: Path, out_dir: Path):
    """安全解压 ZIP（避免编码问题）"""
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
    """递归收集文件夹中所有支持的图片文件"""
    images = []
    for f in folder.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS:
            images.append(f)
    return sorted(images, key=natural_key)


# =====================================================
# 图片诊断
# =====================================================


def diagnose_image(path: Path):
    """检查图片是否有效，失败时附带原因"""
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


def images_to_pdf(images, output_pdf: Path):
    """使用 ImageMagick 将多张图片合成一个 PDF"""
    if not images:
        return False

    cmd = [
        "magick",
        *[str(p) for p in images],
        "-auto-orient",
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
        print(f"[错误] ImageMagick 转换失败: {e}")
        return False


# =====================================================
# 单个 ZIP 处理
# =====================================================


def process_zip(zip_path: Path):
    """处理单个 ZIP 文件：解压 → 诊断 → 合成 PDF"""
    print()
    print("=" * 48)
    print(f"  处理: {zip_path.stem}")
    print("=" * 48)

    output_pdf = zip_path.with_suffix(".pdf")

    with TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        # 解压
        safe_extract(zip_path, tmp)

        images = find_images(tmp)
        print(f"  图片总数: {len(images)}")

        valid_images = []

        print("  正在检查图片...")

        # 逐个诊断
        for img in images:
            ok, info = diagnose_image(img)

            if ok:
                valid_images.append(img)
            else:
                print(f"  [跳过] 无效图片: {info['file']}")
                print(f"    ├─ 原因: {info['reason']}")
                print(f"    └─ 大小: {info['size']} 字节")

        if not valid_images:
            print("  [错误] 未找到有效图片，跳过。")
            return False

        print(f"  有效图片: {len(valid_images)}")

        return images_to_pdf(valid_images, output_pdf)


# =====================================================
# 文件夹批处理
# =====================================================


def process_folder(folder_path):
    """扫描文件夹中的所有 ZIP 并逐个转换为 PDF"""
    root = Path(folder_path).expanduser().resolve()

    zip_files = sorted(root.glob("*.zip"))

    print(f"  扫描目录: {root}")
    print(f"  找到 ZIP 文件数: {len(zip_files)}")

    if not zip_files:
        print("  未找到任何 ZIP 文件。")
        return

    success = 0

    for z in tqdm(zip_files, desc="ZIP 转 PDF 中"):
        if process_zip(z):
            success += 1

    print()
    print("=" * 48)
    print("  任务执行完毕报告")
    print("=" * 48)
    print(f"  文件总数 : {len(zip_files)}")
    print(f"  成功转换 : {success}")
    print(f"  处理失败 : {len(zip_files) - success}")
    print("=" * 48)


# =====================================================
# 命令行入口
# =====================================================


def open_folder(folder_path):
    """用默认文件管理器打开指定目录"""
    path = Path(folder_path).expanduser().resolve()
    if not path.is_dir():
        print(f"目录不存在: {path}")
        return
    if sys.platform == "darwin":
        subprocess.run(["open", str(path)], check=True)
    elif sys.platform == "win32":
        subprocess.run(["explorer", str(path)], check=True)
    else:
        subprocess.run(["xdg-open", str(path)], check=True)
    print(f"已打开: {path}")


def clean_zip_files(folder_path):
    """删除目标目录中的所有 ZIP 压缩文件"""
    root = Path(folder_path).expanduser().resolve()
    zips = sorted(root.glob("*.zip"))
    if not zips:
        print("未找到任何 ZIP 文件。")
        return
    for z in zips:
        z.unlink()
        print(f"已删除: {z.name}")
    print(f"\n共清理 {len(zips)} 个 ZIP 文件。")


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

    args = parser.parse_args()

    if args.clean:
        clean_zip_files(args.folder)
        if args.open:
            open_folder(args.folder)
    else:
        process_folder(args.folder)
        if args.open:
            open_folder(args.folder)

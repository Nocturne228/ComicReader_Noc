#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
from pathlib import Path

from pypdf import PageObject, PdfReader, PdfWriter, Transformation
from tqdm import tqdm

# =====================================================
# 全局配置
# =====================================================

# 需要排除的备份目录名称
EXCLUDE_DIRS = {"x_backup", "y_backup", "temp"}


# =====================================================
# 核心功能：单文件处理
# =====================================================


def resize_single_pdf(
    input_path, output_path, target_width_mm=210, target_height_mm=297, strip_mode=False
):
    """处理单个 PDF 页面的尺寸转换"""
    MM_TO_POINTS = 2.83465
    target_w = target_width_mm * MM_TO_POINTS
    target_h = target_height_mm * MM_TO_POINTS

    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()

        for page in reader.pages:
            mediabox = page.mediabox
            current_w = float(mediabox.width)
            current_h = float(mediabox.height)

            x0 = float(mediabox.lower_left[0])
            y0 = float(mediabox.lower_left[1])

            if strip_mode:
                scale = target_w / current_w
                final_page_w = target_w
                final_page_h = current_h * scale
                tx = -(x0 * scale)
                ty = -(y0 * scale)
            else:
                scale = min(target_w / current_w, target_h / current_h)
                final_page_w = target_w
                final_page_h = target_h
                tx = (target_w - (current_w * scale)) / 2.0 - (x0 * scale)
                ty = (target_h - (current_h * scale)) / 2.0 - (y0 * scale)

            transform = Transformation().scale(scale, scale).translate(tx, ty)
            new_page = PageObject.create_blank_page(
                width=final_page_w, height=final_page_h
            )
            new_page.merge_transformed_page(page, transform)
            writer.add_page(new_page)

        with open(output_path, "wb") as f:
            writer.write(f)
        return True
    except Exception as e:
        print(f"\n[错误] 处理文件失败 {input_path.name}: {e}")
        return False


# =====================================================
# 文件夹批处理
# =====================================================


def process_folder(
    folder_path, target_width_mm=210, target_height_mm=297, strip_mode=False
):
    """批量处理指定文件夹中的所有 PDF"""
    root = Path(folder_path).expanduser().resolve()

    if not root.exists() or not root.is_dir():
        print(f"[错误] 路径不存在或不是一个有效的文件夹 -> {root}")
        return

    # 扫描 PDF，排除备份目录
    all_files = [
        p for p in root.rglob("*.pdf") if not any(d in p.parts for d in EXCLUDE_DIRS)
    ]

    if not all_files:
        print(f"未在目录 {root} 及其子目录下找到任何需要处理的 PDF 文件。")
        return

    print("=" * 48)
    print(
        f"  模式: {'【条形漫画模式】（仅固定宽度）' if strip_mode else '【标准缩放模式】（固定宽高）'}"
    )
    print(f"  目标宽度: {target_width_mm} mm")
    if not strip_mode:
        print(f"  目标高度: {target_height_mm} mm")
    print(f"  扫描到 PDF 数量: {len(all_files)}")
    print("=" * 48)
    print()

    success_count = 0
    skipped_count = 0
    failed_count = 0

    for pdf_path in tqdm(all_files, desc="尺寸缩放中"):
        # 在当前 PDF 同级目录下创建独立备份目录
        current_backup_dir = pdf_path.parent / "x_backup"
        backup_path = current_backup_dir / pdf_path.name

        # 幂等性：备份目录中已存在同名原文件则跳过
        if backup_path.exists():
            print(f"\n[跳过] 开启保护：{pdf_path.name}")
            print(
                f"       -> 原因：专属备份目录 {current_backup_dir.name}/ 中已存在同名原文件"
            )
            skipped_count += 1
            continue

        try:
            current_backup_dir.mkdir(exist_ok=True)

            # 1. 原文件移至备份目录
            pdf_path.rename(backup_path)

            # 2. 从备份读取，处理输出至原路径
            status = resize_single_pdf(
                input_path=backup_path,
                output_path=pdf_path,
                target_width_mm=target_width_mm,
                target_height_mm=target_height_mm,
                strip_mode=strip_mode,
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
            print(f"\n[系统异常] 无法安全备份或处理 {pdf_path.name}: {e}")
            if backup_path.exists() and not pdf_path.exists():
                backup_path.rename(pdf_path)

    print()
    print("=" * 48)
    print("  任务执行完毕报告")
    print("=" * 48)
    print(f"  文件总数 : {len(all_files)}")
    print(f"  成功转换 : {success_count}（原名保存）")
    print(f"  安全跳过 : {skipped_count}（备份目录已存在原文件）")
    print(f"  处理失败 : {failed_count}")
    print("=" * 48)


# =====================================================
# 命令行入口
# =====================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="PDF 页面尺寸批量统一工具（独立 x_backup 文件夹版）"
    )
    parser.add_argument("folder", type=str, help="PDF 文件夹路径")
    parser.add_argument(
        "-s",
        "--strip",
        action="store_true",
        help="开启条形漫画模式（仅固定宽度，高度自适应）",
    )
    parser.add_argument(
        "-w", "--width", type=float, default=210.0, help="目标宽度，单位 mm（默认 210）"
    )
    parser.add_argument(
        "-h",
        "--height",
        type=float,
        default=297.0,
        help="目标高度，单位 mm（默认 297）",
    )

    args = parser.parse_args()
    process_folder(args.folder, args.width, args.height, args.strip)

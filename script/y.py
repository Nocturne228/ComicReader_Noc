#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from tqdm import tqdm

# =====================================================
# 全局配置
# =====================================================

# 需要排除的备份目录名称
EXCLUDE_DIRS = {"x_backup", "y_backup"}


# =====================================================
# 核心功能：单文件处理
# =====================================================


def delete_pdf_pages(
    input_path, output_path, single=None, range_count=None, from_back=False
):
    """处理单个 PDF 的页面删除"""
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
        print(f"\n[错误] 文件 {input_path.name} 页面裁剪失败: {e}")
        return False


# =====================================================
# 文件夹批处理
# =====================================================


def process_folder(folder_path, single=None, range_count=None, from_back=False):
    """批量处理指定文件夹中的所有 PDF"""
    root = Path(folder_path).expanduser().resolve()

    if not root.exists() or not root.is_dir():
        print(f"[错误] 无效的文件夹路径 -> {root}")
        return

    # 扫描 PDF，排除备份目录
    all_files = [
        p for p in root.rglob("*.pdf") if not any(d in p.parts for d in EXCLUDE_DIRS)
    ]

    if not all_files:
        print("未找到需要处理的 PDF 文件。")
        return

    print("=" * 48)
    print(f"  方向: {'【从后往前数】' if from_back else '【从前往后数】'}")
    if single is not None:
        print(f"  动作: 删除第 {single} 页")
    else:
        print(f"  动作: 删除连续的 {range_count} 页")
    print(f"  扫描到 PDF 数量: {len(all_files)}")
    print("=" * 48)
    print()

    success_count = 0
    skipped_count = 0
    failed_count = 0

    for pdf_path in tqdm(all_files, desc="批量剪裁中"):
        # 在当前 PDF 同级目录下创建独立备份目录
        current_backup_dir = pdf_path.parent / "y_backup"
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
            print(f"\n[系统异常] 无法安全备份或处理 {pdf_path.name}: {e}")
            if backup_path.exists() and not pdf_path.exists():
                backup_path.rename(pdf_path)

    print()
    print("=" * 48)
    print("  任务执行完毕报告")
    print("=" * 48)
    print(f"  文件总数 : {len(all_files)}")
    print(f"  成功处理 : {success_count}（原名保存）")
    print(f"  安全跳过 : {skipped_count}（备份目录已存在原文件）")
    print(f"  处理失败 : {failed_count}")
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


def clean_backups(folder_path):
    """递归清理所有 y_backup 备份目录"""
    root = Path(folder_path).expanduser().resolve()
    dirs = sorted(root.rglob("y_backup"))
    if not dirs:
        print("未找到任何 y_backup 备份目录。")
        return
    for d in dirs:
        shutil.rmtree(d)
        print(f"已删除备份目录: {d}")
    print(f"\n共清理 {len(dirs)} 个 y_backup 备份目录。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="PDF 页面批量删除工具（独立 y_backup 文件夹版）"
    )
    parser.add_argument("folder", type=str, help="PDF 文件夹路径")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "-s", "--single", type=int, help="删除指定的单个页码（从 1 开始算）"
    )
    group.add_argument("-r", "--range", type=int, help="删除连续的页数")
    parser.add_argument("-b", "--back", action="store_true", help="切换为从后往前数")
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
    else:
        if args.single is None and args.range is None:
            parser.error("请指定 -s/--single 或 -r/--range（删除页面）或 --clean（清理备份）")
        process_folder(args.folder, args.single, args.range, args.back)
        if args.open:
            open_folder(args.folder)

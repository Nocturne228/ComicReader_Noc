"""Migrate catalog data from ~/.cache/comicreader/ to the workspace directory.

Copies catalog_index.json and cover images. Static assets (HTML, JS, CSS)
are skipped since they will be regenerated on the next run.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

DATA_FILES = [
    "catalog_index.json",
]


def migrate(src: Path, dst: Path, *, dry_run: bool = False) -> None:
    if not src.is_dir():
        print(f"错误: 源目录不存在: {src}")
        sys.exit(1)

    dst.mkdir(parents=True, exist_ok=True)
    (dst / "images").mkdir(exist_ok=True)

    # --- data files ---
    for name in DATA_FILES:
        s = src / name
        if not s.exists():
            print(f"  跳过 (不存在): {name}")
            continue
        d = dst / name
        if d.exists():
            print(f"  跳过 (已存在): {name}")
            continue
        print(f"  复制: {s} -> {d}")
        if not dry_run:
            shutil.copy2(s, d)

    # --- cover images ---
    src_images = src / "images"
    if src_images.is_dir():
        imgs = list(src_images.glob("*.jpg"))
        print(f"\n  封面图: 共 {len(imgs)} 张")
        skipped = 0
        copied = 0
        for img in imgs:
            d = dst / "images" / img.name
            if d.exists():
                skipped += 1
                continue
            if not dry_run:
                shutil.copy2(img, d)
            copied += 1
        print(f"  复制 {copied} 张, 跳过 {skipped} 张 (已存在)")

    # --- update catalog_index.json paths if needed ---
    # The index stores relative keys; no path changes required.
    # But the .catalog_token should NOT be copied — a new one will be
    # generated on the next server start.

    print("\n迁移完成。")
    if dry_run:
        print("(dry-run 模式，未写入任何文件)")


def main() -> None:
    default_src = (
        Path.home() / ".cache" / "comicreader" / "Users_nocturne_Documents_manga_pdf"
    )
    default_dst = Path("~/Documents/manga/workspace").expanduser()

    parser = argparse.ArgumentParser(description="将漫画缓存数据迁移到 workspace 目录")
    parser.add_argument(
        "--src",
        default=str(default_src),
        help=f"旧缓存目录 (默认: {default_src})",
    )
    parser.add_argument(
        "--dst",
        default=str(default_dst),
        help=f"目标 workspace 目录 (默认: {default_dst})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印操作，不实际写入文件",
    )
    args = parser.parse_args()

    src = Path(args.src).expanduser().resolve()
    dst = Path(args.dst).expanduser().resolve()

    print(f"源目录: {src}")
    print(f"目标目录: {dst}")
    if args.dry_run:
        print("(dry-run 模式)\n")
    else:
        print()

    migrate(src, dst, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

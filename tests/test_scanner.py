import tempfile
import unittest
from pathlib import Path

from lib.scanner import (
    _extract_worker,
    find_pdf_files,
    migrate_removed_entries,
)


class FindPdfFilesTest(unittest.TestCase):
    def test_finds_pdf_files_recursively(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.pdf").touch()
            (root / "sub").mkdir()
            (root / "sub" / "b.pdf").touch()
            (root / "c.txt").touch()

            result = find_pdf_files(root)

            names = [p.name for p in result]
            self.assertIn("a.pdf", names)
            self.assertIn("b.pdf", names)
            self.assertNotIn("c.txt", names)

    def test_excludes_temp_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "temp").mkdir()
            (root / "temp" / "hidden.pdf").touch()
            (root / "visible.pdf").touch()

            result = find_pdf_files(root)

            names = [p.name for p in result]
            self.assertIn("visible.pdf", names)
            self.assertNotIn("hidden.pdf", names)


class MigrateRemovedEntriesTest(unittest.TestCase):
    def test_removes_deleted_pdf_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            img_dir = root / "images"
            img_dir.mkdir()

            cover_img = img_dir / "deleted-abc123.jpg"
            cover_img.touch()

            index = {
                "deleted.pdf": {"mtime": 1000.0, "image": "deleted-abc123.jpg"},
            }
            pdf_files = []

            migrated, removed = migrate_removed_entries(index, pdf_files, root, img_dir)

            self.assertEqual(migrated, 0)
            self.assertEqual(removed, 1)
            self.assertNotIn("deleted.pdf", index)
            self.assertFalse(cover_img.exists())

    def test_migrates_moved_pdf_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            img_dir = root / "images"
            img_dir.mkdir()

            old_dir = root / "old_folder"
            old_dir.mkdir()
            old_pdf = old_dir / "comic.pdf"
            old_pdf.touch()
            pdf_mtime = old_pdf.stat().st_mtime

            from lib.utils import cover_filename

            old_key = "old_folder/comic.pdf"
            old_image = cover_filename(old_key)
            old_img_path = img_dir / old_image
            old_img_path.touch()

            new_dir = root / "new_folder"
            new_dir.mkdir()
            new_pdf = new_dir / "comic.pdf"
            old_pdf.rename(new_pdf)
            import os
            os.utime(new_pdf, (pdf_mtime, pdf_mtime))

            index = {old_key: {"mtime": pdf_mtime, "image": old_image}}
            pdf_files = [new_pdf]

            migrated, removed = migrate_removed_entries(index, pdf_files, root, img_dir)

            self.assertEqual(migrated, 1)
            self.assertEqual(removed, 0)
            self.assertNotIn(old_key, index)
            new_key = "new_folder/comic.pdf"
            self.assertIn(new_key, index)

    def test_no_migration_when_mtime_differs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            img_dir = root / "images"
            img_dir.mkdir()

            new_pdf = root / "new_name.pdf"
            new_pdf.touch()

            index = {"old_name.pdf": {"mtime": 999.0, "image": "old.jpg"}}
            pdf_files = [new_pdf]

            migrated, removed = migrate_removed_entries(index, pdf_files, root, img_dir)

            self.assertEqual(migrated, 0)
            self.assertEqual(removed, 1)


class ExtractWorkerTest(unittest.TestCase):
    def test_returns_failure_for_nonexistent_pdf(self):
        pdf_str, success, error = _extract_worker("/nonexistent.pdf", "/tmp/out.jpg")

        self.assertEqual(pdf_str, "/nonexistent.pdf")
        self.assertFalse(success)
        self.assertIsNotNone(error)


if __name__ == "__main__":
    unittest.main()

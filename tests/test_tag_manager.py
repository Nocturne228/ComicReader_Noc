import tempfile
import unittest
from pathlib import Path

from lib.tag_manager import (
    load_tags,
    reconcile_tags,
    save_tags,
    update_pdf_tags,
)


class TagManagerTest(unittest.TestCase):
    def test_save_and_load_normalizes_tag_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            save_tags(root, {
                "tags": [" read ", "read", "", 42],
                "pdfs": {
                    "A.pdf": [" read ", "favorite", "favorite", ""],
                    "B.pdf": [],
                },
            })

            self.assertEqual(load_tags(root), {
                "tags": ["favorite", "read"],
                "pdfs": {"A.pdf": ["read", "favorite"]},
            })
            self.assertTrue((root / "tags.json").exists())

    def test_update_pdf_tags_removes_empty_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            update_pdf_tags(root, "A.pdf", ["read"])
            update_pdf_tags(root, "A.pdf", [])

            self.assertEqual(load_tags(root), {"tags": [], "pdfs": {}})

    def test_reconcile_migrates_unique_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "cache"
            library = Path(tmp) / "library"
            target_dir = library / "new"
            target_dir.mkdir(parents=True)
            pdf = target_dir / "A.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            save_tags(output, {"tags": [], "pdfs": {"old/A.pdf": ["read"]}})

            data, migrated, removed = reconcile_tags(output, [pdf], library)

            self.assertEqual(migrated, 1)
            self.assertEqual(removed, 0)
            self.assertEqual(data["pdfs"], {"new/A.pdf": ["read"]})

    def test_reconcile_removes_ambiguous_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "cache"
            library = Path(tmp) / "library"
            (library / "one").mkdir(parents=True)
            (library / "two").mkdir(parents=True)
            pdf_a = library / "one" / "A.pdf"
            pdf_b = library / "two" / "A.pdf"
            pdf_a.write_bytes(b"%PDF-1.4\n")
            pdf_b.write_bytes(b"%PDF-1.4\n")
            save_tags(output, {"tags": [], "pdfs": {"old/A.pdf": ["read"]}})

            data, migrated, removed = reconcile_tags(output, [pdf_a, pdf_b], library)

            self.assertEqual(migrated, 0)
            self.assertEqual(removed, 1)
            self.assertEqual(data, {"tags": [], "pdfs": {}})


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

from lib.page_notes import (
    delete_page_note,
    load_page_notes,
    reconcile_page_notes,
    update_last_read_page,
    upsert_page_note,
)
from lib.utils import build_allowed_output_paths


class PageNotesTest(unittest.TestCase):
    def test_upsert_delete_and_last_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            pdf = "Series/A.pdf"

            entry = upsert_page_note(
                output,
                pdf,
                {"page": 12, "title": "伏笔", "body": "第一次出现"},
            )
            self.assertEqual(len(entry["notes"]), 1)
            self.assertEqual(entry["notes"][0]["page"], 12)
            note_id = entry["notes"][0]["id"]

            entry = update_last_read_page(output, pdf, 37)
            self.assertEqual(entry["lastReadPage"], 37)

            entry = delete_page_note(output, pdf, note_id)
            self.assertEqual(entry["notes"], [])
            self.assertEqual(entry["lastReadPage"], 37)

            data = load_page_notes(output)
            self.assertEqual(data["pdfs"][pdf]["lastReadPage"], 37)

    def test_reconcile_migrates_by_unique_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = base / "out"
            root = base / "pdf"
            output.mkdir()
            (root / "New").mkdir(parents=True)
            pdf = root / "New" / "A.pdf"
            pdf.write_bytes(b"")

            upsert_page_note(output, "Old/A.pdf", {"page": 3, "title": "旧路径"})
            update_last_read_page(output, "Old/A.pdf", 9)

            data, migrated, removed = reconcile_page_notes(output, [pdf], root)

            self.assertEqual(migrated, 1)
            self.assertEqual(removed, 0)
            self.assertIn("New/A.pdf", data["pdfs"])
            self.assertEqual(data["pdfs"]["New/A.pdf"]["notes"][0]["page"], 3)
            self.assertEqual(data["pdfs"]["New/A.pdf"]["lastReadPage"], 9)

    def test_runtime_allows_page_notes_asset(self):
        paths = build_allowed_output_paths({})
        self.assertIn("page_notes.js", paths)
        self.assertIn("css/page_notes.css", paths)


if __name__ == "__main__":
    unittest.main()

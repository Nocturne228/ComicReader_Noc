import tempfile
import unittest
from pathlib import Path

from lib.builder import build_tree_data, copy_runtime_assets, group_sort_key


class BuilderTest(unittest.TestCase):
    def test_group_sort_key_places_root_files_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            root_pdf = root / "B.pdf"
            child_pdf = root / "Series" / "A.pdf"
            child_pdf.parent.mkdir()
            root_pdf.touch()
            child_pdf.touch()

            ordered = sorted([child_pdf, root_pdf], key=lambda p: group_sort_key(p, root))

            self.assertEqual(ordered, [root_pdf, child_pdf])

    def test_tree_root_pdf_folder_is_empty_string(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            root_pdf = root / "Root.pdf"
            child_pdf = root / "Series" / "Child.pdf"
            child_pdf.parent.mkdir()
            root_pdf.touch()
            child_pdf.touch()

            tree = build_tree_data([root_pdf, child_pdf], root)

            self.assertEqual(tree["name"], "全部")
            uncategorized = tree["children"][0]
            self.assertEqual(uncategorized["name"], "未分类")
            self.assertEqual(uncategorized["children"][0]["folder"], "")
            series = tree["children"][1]
            self.assertEqual(series["folder"], "Series")
            self.assertEqual(series["children"][0]["folder"], "Series")

    def test_copy_runtime_assets_removes_deprecated_feature_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            stale_files = [
                output / "tag.js",
                output / "tag_ui.js",
                output / "page_notes.js",
                output / "catalog.js",
                output / "context_menu.js",
                output / "css" / "tags.css",
                output / "css" / "page_notes.css",
                output / "css" / "tools.css",
            ]
            for path in stale_files:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("stale", encoding="utf-8")

            copy_runtime_assets(output)

            for path in stale_files:
                self.assertFalse(path.exists(), path)


if __name__ == "__main__":
    unittest.main()

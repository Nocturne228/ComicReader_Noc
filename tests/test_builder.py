import tempfile
import unittest
from pathlib import Path

from lib.builder import build_tool_folder_groups, build_tree_data, group_sort_key
from lib.scanner import copy_runtime_assets


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

    def test_tool_folder_groups_include_workspace_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp) / "workspace"
            (work_dir / "temp").mkdir(parents=True)
            (work_dir / "exports").mkdir()
            tree = [
                {
                    "name": "Series",
                    "type": "dir",
                    "folder": "Series",
                    "children": [],
                }
            ]

            groups = build_tool_folder_groups(tree, work_dir)

            self.assertEqual(groups[0]["label"], "工作区")
            self.assertEqual(groups[0]["folders"][0]["scope"], "workspace")
            self.assertEqual(groups[0]["folders"][0]["folder"], "temp")
            self.assertEqual(groups[1]["label"], "漫画库")
            self.assertEqual(groups[1]["folders"][0]["folder"], "")
            self.assertEqual(groups[1]["folders"][1]["folder"], "Series")

    def test_copy_runtime_assets_removes_deprecated_feature_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            stale_files = [
                output / "tag.js",
                output / "tag_ui.js",
                output / "page_notes.js",
                output / "css" / "tags.css",
                output / "css" / "page_notes.css",
            ]
            for path in stale_files:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("stale", encoding="utf-8")

            copy_runtime_assets(output)

            for path in stale_files:
                self.assertFalse(path.exists(), path)


if __name__ == "__main__":
    unittest.main()

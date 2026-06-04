import tempfile
import unittest
from pathlib import Path

from lib.builder import build_tree_data, group_sort_key


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


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

from lib.security import normalize_pdf_request_path
from lib.utils import safe_join


class PathSafetyTest(unittest.TestCase):
    def test_safe_join_rejects_parent_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(safe_join(root, "a/b.pdf"), str((root / "a" / "b.pdf").resolve()))
            with self.assertRaises(ValueError):
                safe_join(root, "../outside.pdf")

    def test_normalize_pdf_request_path(self):
        self.assertEqual(normalize_pdf_request_path("../Series/A%20B.pdf"), "Series/A B.pdf")
        self.assertEqual(normalize_pdf_request_path("/Series/A.pdf?x=1"), "Series/A.pdf")


if __name__ == "__main__":
    unittest.main()

import unittest

from lib.builder import format_stats


class FormatStatsTest(unittest.TestCase):
    def test_basic_stats(self):
        stats = {
            "pdf": 10,
            "covers": 10,
            "updated": 3,
            "skipped": 7,
            "migrated": 0,
            "removed": 0,
            "assets": 0,
        }

        result = format_stats(stats)

        self.assertIn("PDF: 10", result)
        self.assertIn("封面: 10", result)
        self.assertIn("新增/更新: 3", result)
        self.assertIn("跳过: 7", result)

    def test_omits_zero_optional_fields(self):
        stats = {
            "pdf": 5,
            "covers": 5,
            "updated": 5,
            "skipped": 0,
            "migrated": 0,
            "removed": 0,
            "assets": 0,
        }

        result = format_stats(stats)

        self.assertNotIn("跳过", result)
        self.assertNotIn("移动", result)
        self.assertNotIn("移除", result)
        self.assertNotIn("资源更新", result)

    def test_includes_all_nonzero_fields(self):
        stats = {
            "pdf": 20,
            "covers": 18,
            "updated": 5,
            "skipped": 13,
            "migrated": 2,
            "removed": 1,
            "assets": 3,
        }

        result = format_stats(stats)

        self.assertIn("移动: 2", result)
        self.assertIn("移除: 1", result)
        self.assertIn("资源更新: 3", result)


if __name__ == "__main__":
    unittest.main()

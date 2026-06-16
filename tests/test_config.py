import json
import tempfile
import unittest
from pathlib import Path

from lib.config import (
    DEFAULT_USER_CONFIG,
    load_user_config,
    save_user_config,
)


class LoadUserConfigTest(unittest.TestCase):
    def test_returns_defaults_when_file_missing(self):
        config = load_user_config(path="/nonexistent/config.json")

        self.assertEqual(config["host"], "127.0.0.1")
        self.assertEqual(config["port"], 8080)
        self.assertTrue(config["serve"])

    def test_loads_values_from_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps({"host": "0.0.0.0", "port": 9090}), encoding="utf-8")

            config = load_user_config(path=path)

            self.assertEqual(config["host"], "0.0.0.0")
            self.assertEqual(config["port"], 9090)
            self.assertEqual(config["folder"], "")

    def test_ignores_unknown_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps({"unknown_key": True, "port": 3000}), encoding="utf-8")

            config = load_user_config(path=path)

            self.assertEqual(config["port"], 3000)
            self.assertNotIn("unknown_key", config)

    def test_returns_defaults_for_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text("not json {{{", encoding="utf-8")

            config = load_user_config(path=path)

            self.assertEqual(config, DEFAULT_USER_CONFIG)

    def test_returns_defaults_for_non_dict_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text("[1, 2, 3]", encoding="utf-8")

            config = load_user_config(path=path)

            self.assertEqual(config, DEFAULT_USER_CONFIG)


class SaveUserConfigTest(unittest.TestCase):
    def test_creates_config_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sub" / "config.json"

            save_user_config({"folder": "/pdfs", "port": 8080}, path=path)

            self.assertTrue(path.exists())
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["folder"], "/pdfs")
            self.assertEqual(data["port"], 8080)

    def test_roundtrip_load_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            original = {"folder": "/manga", "host": "0.0.0.0", "port": 9000}

            save_user_config(original, path=path)
            loaded = load_user_config(path=path)

            self.assertEqual(loaded["folder"], "/manga")
            self.assertEqual(loaded["host"], "0.0.0.0")
            self.assertEqual(loaded["port"], 9000)


if __name__ == "__main__":
    unittest.main()

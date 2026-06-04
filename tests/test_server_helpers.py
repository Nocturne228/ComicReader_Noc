import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from lib.range_server import handle_range_request
from lib.security import check_control_request
from lib.tool_runner import build_tool_command


class FakeHandler:
    def __init__(self, token="", host="127.0.0.1"):
        self.client_address = (host, 12345)
        self.headers = {"X-ComicReader-Token": token}
        self.status = None
        self.data = None
        self.sent_error = None
        self.headers_sent = []
        self.wfile = SimpleNamespace(write=lambda data: None, flush=lambda: None)

    def send_json(self, status, data):
        self.status = status
        self.data = data

    def send_error(self, status):
        self.sent_error = status

    def guess_type(self, path):
        return "application/pdf"

    def send_response(self, status):
        self.status = status

    def send_header(self, name, value):
        self.headers_sent.append((name, value))

    def end_headers(self):
        pass


class ServerHelperTest(unittest.TestCase):
    def test_check_control_request_validates_host_and_token(self):
        self.assertTrue(check_control_request(FakeHandler("secret"), "secret"))

        bad_token = FakeHandler("bad")
        self.assertFalse(check_control_request(bad_token, "secret"))
        self.assertEqual(bad_token.status, 403)
        self.assertEqual(bad_token.data["message"], "invalid control token")

        bad_host = FakeHandler("secret", host="192.168.1.2")
        self.assertFalse(check_control_request(bad_host, "secret"))
        self.assertEqual(bad_host.status, 403)

    def test_range_request_rejects_out_of_bounds_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "A.pdf"
            path.write_bytes(b"abcdef")
            handler = FakeHandler()

            handle_range_request(handler, path, "bytes=99-", method="HEAD")

            self.assertEqual(handler.sent_error, 416)

    def test_range_request_sets_content_range(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "A.pdf"
            path.write_bytes(b"abcdef")
            handler = FakeHandler()

            handle_range_request(handler, path, "bytes=1-3", method="HEAD")

            self.assertEqual(handler.status, 206)
            self.assertIn(("Content-Range", "bytes 1-3/6"), handler.headers_sent)
            self.assertIn(("Content-Length", "3"), handler.headers_sent)

    def test_zip_tool_uses_dpi_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)

            default_cmd = build_tool_command("z", target, {})
            self.assertEqual(default_cmd[-2:], ["--dpi-mode", "bw"])

            color_cmd = build_tool_command("z", target, {"dpiMode": "color"})
            self.assertEqual(color_cmd[-2:], ["--dpi-mode", "color"])

            with self.assertRaises(ValueError):
                build_tool_command("z", target, {"dpiMode": "1200"})

    def test_y_tool_builds_extract_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)

            png_cmd = build_tool_command(
                "y",
                target,
                {
                    "mode": "extract_png",
                    "file": "Sample.pdf",
                    "page": 3,
                    "dpi": 300,
                    "output": "Sample_page_3.png",
                },
            )
            self.assertIn("--extract-png", png_cmd)
            self.assertIn("--file", png_cmd)
            self.assertIn("--dpi", png_cmd)
            self.assertEqual(png_cmd[-2:], ["--output", "Sample_page_3.png"])

            pdf_cmd = build_tool_command(
                "y",
                target,
                {
                    "mode": "extract_pdf",
                    "file": "Sample.pdf",
                    "start": 2,
                    "end": 5,
                },
            )
            self.assertIn("--extract-pdf", pdf_cmd)
            self.assertEqual(pdf_cmd[-2:], ["2", "5"])

            with self.assertRaises(ValueError):
                build_tool_command(
                    "y",
                    target,
                    {"mode": "extract_pdf", "file": "Sample.pdf", "start": 5, "end": 2},
                )


if __name__ == "__main__":
    unittest.main()

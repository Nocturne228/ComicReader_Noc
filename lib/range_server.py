"""HTTP Range request handling for local PDF serving.

This module provides support for HTTP Range requests, allowing clients to
request specific byte ranges of PDF files for efficient streaming.
"""
import os
import re


def handle_range_request(handler, path, range_header, method="GET"):
    """Stream a single byte range for a translated file path.

    Args:
        handler: HTTP request handler instance.
        path: Absolute path to the file to serve.
        range_header: Range header value from the request.
        method: HTTP method (GET or HEAD).
    """
    try:
        size = os.stat(path).st_size
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not match:
            handler.send_error(400)
            return
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else size - 1
        if start >= size:
            handler.send_error(416)
            return
        end = min(end, size - 1)
        length = end - start + 1

        handler.send_response(206)
        handler.send_header("Content-type", handler.guess_type(path))
        handler.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        handler.send_header("Content-Length", str(length))
        handler.send_header("Accept-Ranges", "bytes")
        handler.end_headers()

        if method == "HEAD":
            return

        with open(path, "rb") as file_obj:
            file_obj.seek(start)
            remaining = length
            while remaining > 0:
                chunk = file_obj.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                try:
                    handler.wfile.write(chunk)
                    handler.wfile.flush()
                except (ConnectionResetError, BrokenPipeError):
                    break
                remaining -= len(chunk)
    except Exception as exc:
        print(f"  [RANGE] error handling range {range_header} for {path}: {exc}", flush=True)
        try:
            handler.send_error(500)
        except Exception:
            pass

"""HTTP control and request path validation helpers.

This module provides security-related functions for validating control requests
and normalizing file paths to prevent directory traversal attacks.
"""
import posixpath
import secrets
from urllib.parse import unquote, urlsplit


def normalize_pdf_request_path(value):
    """Normalize a PDF request path to prevent directory traversal.

    Uses posixpath.normpath to collapse `..` and `.` components (including
    embedded ones like `foo/../../bar`), then strips any remaining leading
    `..` segments that would escape the root.

    Args:
        value: Raw path value from request.

    Returns:
        str: Normalized relative path without leading slashes or traversal.
    """
    rel = unquote(str(value or ""), errors="surrogatepass")
    rel = urlsplit(rel).path
    rel = posixpath.normpath(rel)
    parts = [p for p in rel.split("/") if p and p != ".."]
    return "/".join(parts)


def check_control_request(handler, shutdown_token):
    """Validate that a control request is from localhost with valid token.

    Args:
        handler: HTTP request handler instance.
        shutdown_token: Expected token for authentication.

    Returns:
        bool: True if request is valid, False otherwise.
    """
    if handler.client_address[0] not in {"127.0.0.1", "::1"}:
        handler.send_json(403, {"ok": False, "message": "control actions are only allowed from localhost"})
        return False
    token = handler.headers.get("X-ComicReader-Token", "")
    if not secrets.compare_digest(token, shutdown_token):
        handler.send_json(403, {"ok": False, "message": "invalid control token"})
        return False
    return True

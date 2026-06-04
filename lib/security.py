"""HTTP control and request path validation helpers."""
import secrets
from urllib.parse import unquote, urlsplit


def normalize_pdf_request_path(value):
    rel = unquote(str(value or ""), errors="surrogatepass")
    rel = urlsplit(rel).path
    while rel.startswith("../"):
        rel = rel[3:]
    return rel.lstrip("/")


def check_control_request(handler, shutdown_token):
    if handler.client_address[0] not in {"127.0.0.1", "::1"}:
        handler.send_json(403, {"ok": False, "message": "control actions are only allowed from localhost"})
        return False
    token = handler.headers.get("X-ComicReader-Token", "")
    if not secrets.compare_digest(token, shutdown_token):
        handler.send_json(403, {"ok": False, "message": "invalid control token"})
        return False
    return True

"""Server-side helpers for built-in PDF maintenance tools."""
import subprocess
import sys
from pathlib import Path

from lib.config import PROJECT_ROOT

ALLOWED_TOOLS = {"x", "y", "z"}


def resolve_child_dir(root_dir, folder_rel=".", allow_temp=False):
    """Resolve a user-selected folder under the PDF root."""
    root_dir = Path(root_dir).resolve()
    target_dir = (root_dir / (folder_rel or ".")).resolve()
    try:
        target_dir.relative_to(root_dir)
    except ValueError as exc:
        raise ValueError("folder must be inside PDF root") from exc

    if not target_dir.is_dir():
        if allow_temp and target_dir.name == "temp" and target_dir.parent == root_dir:
            target_dir.mkdir(parents=True, exist_ok=True)
        else:
            raise FileNotFoundError(f"directory not found: {target_dir}")
    return target_dir


def build_tool_command(tool, target_dir, params):
    """Build a subprocess command for one of the bundled tools."""
    if tool not in ALLOWED_TOOLS:
        raise ValueError(f"unknown tool: {tool}")

    script_path = PROJECT_ROOT / "script" / f"{tool}.py"
    if not script_path.is_file():
        raise FileNotFoundError(f"script not found: {script_path}")

    params = params or {}
    cmd = [sys.executable, "-u", str(script_path), str(target_dir)]

    if tool == "x":
        if params.get("strip"):
            cmd.append("-s")
        if params.get("width"):
            cmd.extend(["-w", str(params["width"])])
        if params.get("height"):
            cmd.extend(["--height", str(params["height"])])
    elif tool == "y" and not params.get("clean"):
        single = params.get("single")
        rng = params.get("range")
        if isinstance(single, int) and single > 0:
            cmd.extend(["-s", str(single)])
        elif isinstance(rng, int) and rng > 0:
            cmd.extend(["-r", str(rng)])
        else:
            raise ValueError("y.py requires single or range param")
        if params.get("back"):
            cmd.append("-b")

    if params.get("clean"):
        cmd.append("--clean")
    if params.get("open_after"):
        cmd.append("--open")
    return cmd


def open_path(path):
    """Open a path in the platform's file manager."""
    path = Path(path).resolve()
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif sys.platform == "win32":
        subprocess.Popen(["explorer", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])

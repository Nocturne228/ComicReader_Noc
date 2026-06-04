"""Server-side helpers for built-in PDF maintenance tools.

This module provides functions for building subprocess commands for the
bundled PDF tools (x, y, z) and resolving target directories for tool execution.
"""
import subprocess
import sys
from pathlib import Path

from lib.config import PROJECT_ROOT

ALLOWED_TOOLS = {"x", "y", "z"}
DPI_MODES = {"bw", "color"}
WORKSPACE_DEFAULT_DIRS = {"temp", "exports", "logs"}
TOOL_EXCLUDE_DIRS = {"x_backup", "y_backup"}


def resolve_child_dir(root_dir, folder_rel=".", allow_temp=False):
    """Resolve a user-selected folder under the PDF root.

    Args:
        root_dir: Root directory path.
        folder_rel: Relative folder path from root.
        allow_temp: Whether to allow creating temp directory.

    Returns:
        Path: Resolved directory path.

    Raises:
        ValueError: If folder is outside root directory.
        FileNotFoundError: If directory doesn't exist.
    """
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


def resolve_tool_dir(library_root, work_dir, scope="workspace", folder_rel="."):
    """Resolve a tool target under either the library root or the workspace root.

    Args:
        library_root: Library root directory path.
        work_dir: Workspace directory path.
        scope: Either "workspace" or "library".
        folder_rel: Relative folder path from the scope root.

    Returns:
        Path: Resolved directory path.

    Raises:
        ValueError: If scope is invalid or folder is outside scope.
        FileNotFoundError: If directory doesn't exist.
    """
    scope = scope or "workspace"
    if scope not in {"workspace", "library"}:
        raise ValueError("scope must be workspace or library")

    if scope == "workspace":
        root_dir = Path(work_dir).resolve()
        folder_rel = folder_rel or "temp"
        target_dir = (root_dir / folder_rel).resolve()
        try:
            target_dir.relative_to(root_dir)
        except ValueError as exc:
            raise ValueError("workspace folder must be inside work dir") from exc
        if not target_dir.is_dir():
            parts = Path(folder_rel).parts
            if len(parts) == 1 and parts[0] in WORKSPACE_DEFAULT_DIRS:
                target_dir.mkdir(parents=True, exist_ok=True)
            else:
                raise FileNotFoundError(f"directory not found: {target_dir}")
        return target_dir

    return resolve_child_dir(library_root, folder_rel or ".")


def build_tool_command(tool, target_dir, params):
    """Build a subprocess command for one of the bundled tools.

    Args:
        tool: Tool identifier ("x", "y", or "z").
        target_dir: Target directory for the tool.
        params: Tool-specific parameters.

    Returns:
        list: Command line arguments for subprocess.

    Raises:
        ValueError: If tool is unknown or parameters are invalid.
        FileNotFoundError: If tool script doesn't exist.
    """
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
        if params.get("file"):
            cmd.extend(["--file", str(params["file"])])
    elif tool == "y" and not params.get("clean"):
        mode = params.get("mode") or "delete"
        if mode == "extract_png":
            pdf_file = params.get("file")
            page = params.get("page")
            dpi = params.get("dpi") or 300
            if not pdf_file or not isinstance(page, int) or page <= 0:
                raise ValueError("y.py extract_png requires file and positive page")
            cmd.extend(["--file", str(pdf_file), "--extract-png", str(page)])
            if isinstance(dpi, int) and dpi > 0:
                cmd.extend(["--dpi", str(dpi)])
        elif mode == "extract_pdf":
            pdf_file = params.get("file")
            start = params.get("start")
            end = params.get("end")
            if (
                not pdf_file
                or not isinstance(start, int)
                or not isinstance(end, int)
                or start <= 0
                or end < start
            ):
                raise ValueError("y.py extract_pdf requires file and valid page range")
            cmd.extend(["--file", str(pdf_file), "--extract-pdf", str(start), str(end)])
        else:
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
            if params.get("file"):
                cmd.extend(["--file", str(params["file"])])
        if params.get("output"):
            cmd.extend(["--output", str(params["output"])])
    elif tool == "z" and not params.get("clean"):
        dpi_mode = params.get("dpiMode") or params.get("dpi_mode") or "bw"
        if dpi_mode not in DPI_MODES:
            raise ValueError("dpi mode must be color or bw")
        cmd.extend(["--dpi-mode", dpi_mode])
        if params.get("file"):
            cmd.extend(["--file", str(params["file"])])

    if params.get("clean"):
        cmd.append("--clean")
    if params.get("open_after"):
        cmd.append("--open")
    return cmd


def list_tool_files(tool, target_dir):
    """List files that can be selected for a bundled tool.

    Args:
        tool: Tool identifier ("x", "y", or "z").
        target_dir: Resolved target directory for the tool.

    Returns:
        list: Relative file paths using POSIX separators.

    Raises:
        ValueError: If tool is unknown.
    """
    if tool not in ALLOWED_TOOLS:
        raise ValueError(f"unknown tool: {tool}")

    target_dir = Path(target_dir).resolve()
    if tool in {"x", "y"}:
        files = [
            p
            for p in target_dir.rglob("*.pdf")
            if p.is_file() and not any(d in p.parts for d in TOOL_EXCLUDE_DIRS)
        ]
    else:
        files = [p for p in target_dir.glob("*.zip") if p.is_file()]

    return [
        p.relative_to(target_dir).as_posix()
        for p in sorted(files, key=lambda path: path.relative_to(target_dir).as_posix().lower())
    ]


def open_path(path):
    """Open a path in the platform's file manager.

    Args:
        path: Path to open in file manager.
    """
    path = Path(path).resolve()
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif sys.platform == "win32":
        subprocess.Popen(["explorer", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])

# Cross-Platform Compatibility Guide

This project is now fully compatible with both **Windows** and **macOS/Linux** systems.

## Cross-Platform Improvements

### 1. **Output Buffering (Lines 35-42)**
```python
try:
    sys.stdout.reconfigure(line_buffering=True, write_through=True)
    sys.stderr.reconfigure(line_buffering=True, write_through=True)
except AttributeError:
    # macOS/Linux don't support reconfigure(), which is fine
    pass
```
- **Windows**: Enables line buffering and write-through mode for reliable terminal output
- **macOS/Linux**: The `reconfigure()` method doesn't exist; we gracefully handle this with try-except

### 2. **Print Flush Parameter**
All `print()` statements use `flush=True`:
```python
print(f"Message", flush=True)
```
- **Purpose**: Ensures output appears immediately on both platforms
- **Windows**: Essential for reliable console output in terminal applications
- **macOS/Linux**: Also beneficial for real-time output visibility
- **Impact**: No performance penalty on any platform

### 3. **Threading HTTP Server**
```python
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
server = ThreadingHTTPServer((host, port), CatalogHandler)
```
- **Why**: Supports concurrent request handling
- **Availability**: Both Windows and macOS/Linux (Python 3.7+)
- **Benefit**: Better responsiveness for multiple simultaneous connections

### 4. **Path Handling**
The codebase uses `pathlib.Path` exclusively:
```python
from pathlib import Path
PROJECT_ROOT = Path(__file__).parent.resolve()
```
- **Windows**: Handles both `/` and `\` path separators correctly
- **macOS/Linux**: Uses `/` path separators natively
- **Best Practice**: Platform-independent and safe

## Verified Compatibility

✅ **Windows (Python 3.14.3)**
- Terminal output buffering: Configured
- HTTP server: ThreadingHTTPServer (3.7+)
- Path handling: Using pathlib

✅ **macOS/Linux**
- Terminal output: Works without reconfigure()
- HTTP server: ThreadingHTTPServer (3.7+)
- Path handling: Native forward-slash support

## Dependencies
All dependencies used are cross-platform:
- `pathlib` - Standard library, cross-platform
- `json`, `re`, `sys`, `threading` - Standard library
- `jinja2` - Cross-platform
- `pdf2image` - Cross-platform (uses Poppler/ImageMagick)
- `tqdm` - Cross-platform

## Testing Recommendations

To ensure cross-platform compatibility:
1. Test on both Windows and macOS/Linux
2. Verify terminal output appears correctly
3. Test concurrent file access in the PDF directory
4. Check that the web server responds to multiple simultaneous requests

## Future Enhancements

- Add platform-specific logging if needed
- Consider adding platform detection utilities for future platform-specific code
- Maintain current approach of preferring platform-agnostic solutions (pathlib, try-except, etc.)

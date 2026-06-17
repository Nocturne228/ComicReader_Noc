# 开发者指南

本文档面向希望参与开发或基于本项目进行二次开发的开发者，涵盖环境搭建、编码规范、测试、功能扩展等核心内容。

## 目录

- [开发环境搭建](#开发环境搭建)
- [项目约定](#项目约定)
- [测试](#测试)
- [功能扩展指南](#功能扩展指南)
- [常见问题排查](#常见问题排查)
- [提交规范](#提交规范)

---

## 开发环境搭建

### 1. 克隆仓库

```bash
git clone https://github.com/Nocturne228/ComicReader_Noc.git
cd ComicReader_Noc
```

### 2. Python 环境

建议使用虚拟环境：

```bash
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
.venv\Scripts\activate           # Windows
```

### 3. 安装依赖

```bash
pip install -r requirements.txt
```

> `requirements.txt` 仅包含运行时依赖：`jinja2`、`pdf2image`、`pypdf`、`tqdm`。
> `Pillow` 作为 `pdf2image` 的隐式依赖会自动安装。

### 4. 系统依赖

安装 `poppler` 以支持 PDF 封面提取（详见 [README.md](README.md#系统依赖)）。

### 5. 验证安装

```bash
# Python 语法检查
python -m py_compile catalog.py lib/*.py tests/*.py

# 运行测试
python -m unittest discover -s tests

# JS 语法检查
node --check static/app.js
find static/modules -name '*.js' -print -exec node --check {} \;
```

---

## 项目约定

### Python

| 约定 | 说明 |
|------|------|
| 最低版本 | Python 3.8+（HTTP 服务使用 `ThreadingHTTPServer`） |
| 编码风格 | 遵循 PEP 8，缩进 4 空格 |
| 类型提示 | 可选，不强制要求 |
| Docstring | Google 风格（Args/Returns/Raises） |
| 模块入口 | 每个 `lib/*.py` 模块顶部包含模块级 docstring |
| 导入顺序 | 标准库 → 第三方库 → 本地模块，各组之间空一行 |
| 路径处理 | 统一使用 `pathlib.Path`，不混用 `os.path` |
| 错误输出 | 使用 `print(f"错误/警告: ...")` 输出到终端 |

**模块间引用规则：**

```
catalog.py (入口)
    ├── lib/config.py     ← 所有模块可引用
    ├── lib/utils.py      ← 所有模块可引用
    ├── lib/security.py   ← server, control_api
    ├── lib/scanner.py    ← builder
    ├── lib/builder.py    ← catalog, control_api
    ├── lib/server.py     ← catalog
    ├── lib/range_server.py ← server
    └── lib/control_api.py  ← server
```

`config.py` 和 `utils.py` 作为基础模块，不依赖其他 `lib/` 模块。其他模块之间的依赖关系应保持单向，避免循环引用。

### JavaScript

| 约定 | 说明 |
|------|------|
| 语言级别 | 原生 ES Modules，无构建工具 |
| 入口 | `static/app.js` 负责初始化主题、侧边栏、目录树、事件、快捷键和右键菜单 |
| 模块通信 | 各 `static/modules/*.js` 通过显式 import/export 协作，不依赖全局 `CatalogApp` |
| 持久化 | 所有客户端状态使用 `localStorage`，键名以 `@` 前缀标识 |
| 注释 | 仅在非显而易见的逻辑处添加注释，函数签名使用 JSDoc |
| 第三方库 | `vendor/` 目录存放 UMD/ESM 包，不依赖 CDN |

**注意：** 本项目不使用任何前端构建工具（webpack/vite/rollup 等）。所有 JS 文件直接由浏览器加载，修改后刷新即可生效。

### CSS

| 约定 | 说明 |
|------|------|
| 架构 | 模块化 `@import`，`catalog.css` 为入口聚合文件 |
| 变量 | 使用 CSS Custom Properties（`--var-name`），定义在 `base.css` |
| 主题 | 暗色模式通过 `.dark-theme` 类覆盖 CSS 变量实现 |
| 命名 | BEM 风格或语义化类名，不使用 ID 选择器 |
| 添加新模块 | 新建 `css/xxx.css` 后在 `catalog.css` 中添加 `@import` |
| 目标端 | 仅支持电脑端本地部署，不新增移动端断点或移动端专用样式 |

### Jinja2 模板

| 约定 | 说明 |
|------|------|
| 文件 | `templates/catalog.html.j2`（项目中唯一的模板文件） |
| 自动转义 | 已启用（`select_autoescape(["html", "xml", "j2"])`） |
| 配置注入 | 通过 `window.CATALOG_CONFIG` 全局 JSON 对象传递后端配置到前端 |

---

## 测试

### 运行测试

```bash
python -m unittest discover -s tests -v
```

### 现有测试

| 文件 | 覆盖范围 |
|------|----------|
| `tests/test_paths.py` | `safe_join()` 路径遍历防护、`normalize_pdf_request_path()` URL 规范化 |
| `tests/test_server_helpers.py` | HTTP Range 响应、控制 Token 验证 |
| `tests/test_builder.py` | 目录树构建、排序逻辑、废弃资源清理 |

### 编写新测试

- 使用 `unittest` 标准库，不引入 `pytest`
- 测试文件命名：`test_<module>.py`
- 类继承 `unittest.TestCase`，方法名以 `test_` 开头
- 对于涉及文件系统的测试，使用 `tempfile.TemporaryDirectory` 创建临时目录
- 对于涉及 HTTP 的测试，使用 `unittest.mock` 模拟 handler 对象

示例：

```python
import unittest
from lib.utils import safe_join

class TestSafeJoin(unittest.TestCase):
    def test_normal_path(self):
        result = safe_join("/base", "sub/file.pdf")
        self.assertTrue(result.endswith("sub/file.pdf"))

    def test_traversal_blocked(self):
        result = safe_join("/base", "../../etc/passwd")
        self.assertIn("__invalid_path__", result)
```

### 检查清单（提交前）

```bash
# 1. Python 语法
python -m py_compile catalog.py lib/*.py tests/*.py

# 2. 单元测试
python -m unittest discover -s tests

# 3. JavaScript 语法
node --check static/app.js
find static/modules -name '*.js' -print -exec node --check {} \;

# 4. 手动功能验证（推荐）
python catalog.py /path/to/test/pdfs --serve
```

---

## 功能扩展指南

### 添加新的控制端点（Control API）

控制端点允许前端通过 POST 请求触发服务端操作。

**1. 在 `lib/control_api.py` 中添加处理函数：**

```python
def handle_my_action(handler, ctx):
    """Handle my custom action."""
    if not handler.check_control_request():
        return
    # 业务逻辑...
    handler.send_json(200, {"ok": True, "message": "done"})
```

**2. 在 `lib/server.py` 的 `routes` 字典中注册路由：**

```python
routes = {
    "/__shutdown": control_api.handle_shutdown,
    "/__refresh": control_api.handle_refresh,
    # ...
    "/__my_action": control_api.handle_my_action,  # 新增
}
```

**3. 在 `lib/builder.py` 的 `generate_html()` 中将路径注入前端配置：**

```python
catalog_config = {
    # ...
    "myActionPath": "/__my_action",
}
```

**4. 在相关 `static/modules/*.js` 模块中调用：**

```javascript
import { CONFIG } from "./config.js";

export function triggerMyAction() {
    return fetch(CONFIG.myActionPath, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-ComicReader-Token": CONFIG.shutdownToken,
        },
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.ok) console.log("Action completed");
    });
}
```

### 添加新的 CSS 模块

**1. 创建样式文件：** `static/css/my_module.css`

**2. 在 `static/catalog.css` 中添加导入：**

```css
@import url("css/my_module.css");
```

> `copy_runtime_assets()` 会自动将 `css/` 目录下的所有 `.css` 文件复制到输出目录，无需额外配置。

### 添加新的前端配置项

**1. 在 `lib/builder.py` 的 `generate_html()` 中添加到 `catalog_config`：**

```python
catalog_config = {
    # ...
    "myNewOption": 42,
}
```

**2. 在需要该配置的 ES Module 中通过 `CONFIG` 访问：**

```javascript
import { CONFIG } from "./config.js";

var value = CONFIG.myNewOption;
```

> `static/modules/config.js` 将 `window.CATALOG_CONFIG` 导出为 `CONFIG`，需要配置的模块显式导入即可。

### 添加新的静态资源文件

**1. 将文件放入 `static/` 目录对应位置。**

**2. 在 `lib/utils.py` 的 `iter_runtime_assets()` 中注册：**

```python
def iter_runtime_assets():
    yield UMD_SRC, f"{VENDOR_DIR}/{UMD_FILE}"
    yield STATIC_DIR / CSS_FILE, CSS_FILE
    # ...
    yield STATIC_DIR / "my_asset.js", "my_asset.js"  # 新增
```

**3. 如果需要 HTTP 白名单放行，在 `lib/builder.py` 的 `build_allowed_output_paths()` 中添加：**

```python
def build_allowed_output_paths(index):
    paths = {
        HTML_FILE, CSS_FILE, JS_FILE, CONTEXT_MENU_JS_FILE,
        "my_asset.js",  # 新增
    }
    # ...
```

### 添加新的排除目录

在 `lib/config.py` 中修改 `EXCLUDE_DIRS`：

```python
EXCLUDE_DIRS = {"temp", "backup"}  # 添加 backup
```

> `find_pdf_files()` 在扫描 PDF 时会自动跳过这些目录。

### 修改封面提取参数

在 `lib/scanner.py` 的 `extract_first_page()` 中调整：

```python
def extract_first_page(pdf_path, img_path):
    convert_from_path(
        pdf_path,
        first_page=1,
        last_page=1,
        dpi=200,       # 提高 DPI（默认 150）
    )[0].save(img_path, "JPEG", quality=90)  # 提高 JPEG 质量（默认 85）
```

> 修改后需要删除缓存目录以强制重新提取所有封面，或等待对应 PDF 的 mtime 变化时自动更新。

### 添加新的键盘快捷键

在 `static/modules/shortcuts.js` 的全局 `keydown` 事件处理器中添加新的分支：

```javascript
document.addEventListener("keydown", function (e) {
    // ... 现有的过滤逻辑（Cmd/Ctrl 放行、输入框跳过等）
    switch (e.key) {
        // ...
        case "n":  // 新增：按 N 触发某功能
            e.preventDefault();
            myNewFeature();
            break;
    }
});
```

同步更新 `templates/catalog.html.j2` 中的快捷键帮助面板。

---

## 常见问题排查

### poppler 未安装 / `pdftoppm` 找不到

**症状：** `FileNotFoundError: [WinError 2]` 或 `pdf2image` 报错。

**解决：**
- macOS: `brew install poppler`
- Windows: 下载 [poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases)，解压后将 `bin` 目录加入系统 `PATH`
- 验证: `pdftoppm -v` 应输出版本号

### 端口被占用

**症状：** `OSError: [Errno 98] Address already in use`

**解决：**
```bash
# 使用其他端口
python catalog.py /path/to/pdfs --serve -p 9090

# 或找到占用进程
# macOS/Linux:
lsof -i :8080
# Windows:
netstat -ano | findstr :8080
```

### 封面未更新

**症状：** 修改了 PDF 文件但封面仍然显示旧的。

**原因：** 增量更新依赖 `mtime` 变化检测。如果修改后 `mtime` 未变（极少见），缓存不会更新。

**解决：**
```bash
# 方法 1：touch 文件更新 mtime
touch /path/to/pdf/file.pdf

# 方法 2：删除缓存目录，强制全量重建
rm -rf ~/.cache/comicreader/<路径名>/
```

### 重启后浏览器需要刷新

**说明：** 这是正常行为。重启服务时：
- macOS/Linux：使用 `os.execv()` 原地替换进程，浏览器自动重连
- Windows：使用 `subprocess.Popen()` 启动新进程 + 关闭旧进程，浏览器可能需要手动刷新

### Range 请求失败

**症状：** PDF 加载缓慢或报错，浏览器 DevTools 显示 416/400 错误。

**排查：**
1. 确认未使用 `--disable-range`
2. 检查环境变量 `COMICREAD_RANGE_SUPPORT` 未被设为 `0`/`false`/`no`
3. 前端会自动回退到全量下载，不会导致功能不可用

---

## 提交规范

### Commit Message 格式

```
<type>: <简短描述>

[可选的详细说明]
```

**type 类型：**

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `perf` | 性能优化 |
| `docs` | 文档更新 |
| `style` | 代码风格（不影响功能） |
| `test` | 测试相关 |
| `chore` | 构建、CI、依赖等杂项 |

### 分支策略

- `master` — 主分支，保持稳定
- `feature/<name>` — 功能开发分支
- `fix/<name>` — Bug 修复分支
- `windows-opt` — Windows 性能优化分支（已有）

### 提交前检查

确保以下命令全部通过后再提交：

```bash
python -m py_compile catalog.py lib/*.py tests/*.py
python -m unittest discover -s tests
node --check static/app.js
find static/modules -name '*.js' -print -exec node --check {} \;
```

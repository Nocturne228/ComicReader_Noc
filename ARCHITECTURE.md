# 架构文档

本文档深入描述 Nocturne Manga 的系统架构、模块职责、数据流转、安全模型和前端渲染管线，帮助开发者快速理解项目全貌。

## 目录

- [系统概览](#系统概览)
- [模块依赖关系](#模块依赖关系)
- [目录生成管线](#目录生成管线)
- [HTTP 服务与路由](#http-服务与路由)
- [安全模型](#安全模型)
- [前端渲染管线](#前端渲染管线)
- [配置系统](#配置系统)
- [存储与缓存策略](#存储与缓存策略)

---

## 系统概览

Nocturne Manga 是一个**纯本地运行、面向电脑端个人部署**的漫画浏览系统，无需外部网络服务。整体架构分为两层：

```
┌──────────────────────────────────────────────────────┐
│                   Python 后端                         │
│                                                      │
│  catalog.py ──→ builder.py ──→ scanner.py            │
│      │              │              │                  │
│      │              │         pdf2image/poppler       │
│      │              │                                  │
│      └──→ server.py ──→ control_api.py               │
│              │              │                          │
│              │         range_server.py                 │
│              │              │                          │
│              └──→ security.py                         │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP
┌───────────────────────▼──────────────────────────────┐
│                   浏览器前端                           │
│                                                      │
│  catalog.html (Jinja2 生成)                           │
│      │                                               │
│      ├── app.js (前端入口)                             │
│      │       ├── modules/reader.js                     │
│      │       ├── modules/tree.js/search.js/...         │
│      │       ├── pdf.js (PDF 解析与页面渲染)            │
│      │       └── ComicRead UMD (双页阅读器)             │
│                                                      │
│  CSS: 模块化 @import 源文件，生成时合并为 catalog.css     │
│  持久化: localStorage                                 │
└──────────────────────────────────────────────────────┘
```

**核心设计决策：**

- **零外部依赖**：pdf.js 和 ComicRead 均以本地文件形式打包在 `vendor/` 中，可完全离线运行
- **无数据库**：所有状态通过文件系统（JSON 索引、封面图片）和浏览器 localStorage 管理
- **无构建步骤**：前端不使用任何打包工具，JS/CSS 直接由浏览器加载
- **增量更新**：通过 `mtime` 变化检测避免重复处理未变更的 PDF

---

## 模块依赖关系

```
lib/config.py          ← 基础模块，无内部依赖
    ↑
lib/utils.py           ← 基础模块，依赖 config
    ↑
lib/security.py        ← 依赖标准库（无内部依赖）
    ↑
lib/scanner.py         ← 依赖 config, utils, pdf2image
    ↑
lib/builder.py         ← 依赖 config, utils, scanner, jinja2
    ↑
lib/range_server.py    ← 依赖标准库（无内部依赖）
    ↑
lib/server.py          ← 依赖 control_api, range_server, security, utils
    ↑
lib/control_api.py     ← 依赖 builder, security, utils
    ↑
catalog.py             ← 入口，依赖 builder, config, server, utils
```

**分层原则：**

| 层 | 模块 | 职责 |
|----|------|------|
| 基础层 | `config.py`, `utils.py`, `security.py` | 常量、工具函数、安全校验，不依赖业务逻辑 |
| 业务层 | `scanner.py`, `builder.py` | PDF 扫描、封面提取、HTML 生成 |
| 服务层 | `server.py`, `control_api.py`, `range_server.py` | HTTP 服务、控制端点、Range 请求 |
| 入口层 | `catalog.py` | CLI 解析、流程编排 |

---

## 目录生成管线

`rebuild_catalog()` 是核心编排函数（`lib/builder.py`），按以下顺序执行：

```
输入: pdf_root, output_dir
                │
                ▼
     ┌─── load_index() ◄── catalog_index.json（上次缓存）
     │
     ▼
     ├─── find_pdf_files(root)          # 递归扫描 *.pdf，排除 temp/
     │        │
     │        ▼
     ├─── migrate_removed_entries()     # 处理移动/重命名/删除
     │        │  匹配规则：同名 + 同 mtime → 迁移索引条目和封面文件
     │        │  未匹配 → 删除索引条目和封面文件
     │        ▼
     ├─── process_cover_cache()         # 增量封面提取
     │        │  新 PDF → extract_first_page()
     │        │  mtime 变化 → 重新提取
     │        │  无变化 → 跳过
     │        ▼
     ├─── copy_runtime_assets()         # 复制 JS/CSS/vendor 到输出目录
     │        │  仅在 size 或 mtime 变化时复制
     │        │  同时清理已废弃的资源文件
     │        ▼
     ├─── save_index() ──► catalog_index.json
     │
     ▼
     └─── generate_html()               # Jinja2 渲染 catalog.html
              │  输入: folder_groups, tree_data, catalog_config
              │  输出: catalog.html
              ▼
     返回: { stats, index, pdf_files,
             allowed_pdf_paths, allowed_output_paths }
```

**增量更新状态机：**

```
                  ┌──────────────┐
                  │  上次索引中   │
                  │  存在此 PDF? │
                  └──────┬───────┘
                    /          \
                  Yes            No
                  │               │
            ┌─────▼──────┐   ┌───▼──────────┐
            │ mtime 变化? │   │ 新 PDF       │
            └─────┬──────┘   │ → 提取封面    │
              /       \      │ → 加入索引    │
            Yes       No     └──────────────┘
            │          │
     ┌──────▼───┐  ┌───▼────────┐
     │ 重新提取  │  │ 跳过       │
     │ 封面      │  │ (使用缓存) │
     └──────────┘  └────────────┘
```

---

## HTTP 服务与路由

### 服务启动流程

```
catalog.py: process_folder()
    │
    ├── rebuild_catalog()              # 生成 HTML + 缓存
    │
    ├── _load_or_create_token()        # 持久化控制 Token
    │
    └── start_http_server()            # lib/server.py
            │
            ├── 创建 ServerContext      # 包含所有服务状态
            │
            ├── 注册路由表              # /__shutdown, /__refresh, ...
            │
            ├── 创建 CatalogHandler    # 自定义请求处理器
            │
            └── ThreadingHTTPServer    # 后台线程启动
                    │
                    ▼
            主线程等待 shutdown_requested 事件
```

### 路由表

| 路径 | 方法 | 处理函数 | 说明 |
|------|------|----------|------|
| `/output/*.html/css/js/...` | GET | `CatalogHandler.do_GET` | 输出目录中的静态文件（白名单） |
| `/*.pdf` | GET | `CatalogHandler.do_GET` | PDF 文件（白名单，从源目录服务） |
| `/*.pdf` + `Range` 头 | GET/HEAD | `handle_range_request` | 206 Partial Content 流式响应 |
| `/__shutdown` | POST | `handle_shutdown` | 关闭 HTTP 服务 |
| `/__refresh` | POST | `handle_refresh` | 重新扫描并重建目录 |
| `/__open_native` | POST | `handle_open_native` | macOS Preview 打开 PDF |
| `/__open_root` | POST | `handle_open_root` | 在文件管理器中打开根目录 |
| `/__restart` | POST | `handle_restart` | 重启 HTTP 服务 |
| 其他路径 | GET | 403/404 | 白名单拒绝或文件不存在 |

### 请求处理流程

```
GET /path/to/file
    │
    ▼
translate_path(path)
    │
    ├── 以 "output/" 开头？
    │     ├── 在 allowed_output_paths 中？ → output_dir/<rel>
    │     └── 否 → 拒绝（返回不存在的路径）
    │
    ├── 在 allowed_output_paths 中？ → output_dir/<rel>
    │
    ├── 在 allowed_pdf_paths 中？ → pdf_root/<rel>
    │
    └── 均不匹配 → 拒绝
    │
    ▼
有 Range 头 且 range_support 启用？
    ├── 是 → handle_range_request() → 206 Partial Content
    └── 否 → SimpleHTTPRequestHandler → 200 OK
```

### ServerContext

`ServerContext` 是服务端的共享状态对象，包含：

```python
@dataclass
class ServerContext:
    pdf_root: Path          # PDF 源文件根目录
    output_dir: Path        # 生成的缓存目录
    state: ServerState      # 线程安全的路径白名单容器（内含 Lock）
    shutdown_token: str     # 控制端点认证 Token
    base_url: str           # 服务基础 URL
    range_support: bool     # 是否支持 Range 请求
    shutdown_requested: Event   # 关闭信号
    refresh_lock: Lock      # 刷新操作互斥锁
```

`ServerState` 对象中的路径集合在 `handle_refresh()` 后会通过 `update_paths()` 原子更新，确保新添加的 PDF 立即可访问。

---

## 安全模型

本项目采用**纵深防御**策略，在多个层面实施安全控制：

### 1. 路径白名单

服务端维护两个白名单集合：

- `allowed_pdf_paths`：索引中所有 PDF 的相对路径（由 `catalog_index.json` 的键集决定）
- `allowed_output_paths`：所有生成的资源文件路径（HTML、CSS、JS、封面图片）

`translate_path()` 在处理每个请求时严格检查白名单。**不在白名单中的文件无法通过 HTTP 访问**，即使它存在于文件系统中。

### 2. 路径遍历防护

两层防护机制：

**`safe_join()`（`lib/utils.py`）：**
- 使用 `Path.resolve()` 解析符号链接
- 验证解析后的路径仍在基础目录内
- 拒绝包含 null 字节的路径
- 失败时返回 `__invalid_path__`（不抛出异常）

**`normalize_pdf_request_path()`（`lib/security.py`）：**
- URL 解码
- `posixpath.normpath()` 规范化（折叠 `..` 和 `.`）
- 过滤所有 `..` 路径段
- 返回安全的相对路径

### 3. 控制端点认证

所有 POST 控制端点（`/__shutdown`、`/__refresh` 等）要求：

- **来源限制**：仅接受 `127.0.0.1` 或 `::1` 的请求
- **Token 验证**：请求头 `X-ComicReader-Token` 必须与服务端 Token 匹配
- **时序安全**：使用 `secrets.compare_digest()` 进行比较，防止时序攻击

```
POST /__shutdown
    │
    ├── client_address ∈ {127.0.0.1, ::1}？
    │     └── 否 → 403
    │
    └── X-ComicReader-Token == shutdown_token？
          └── 否 → 403
          └── 是 → 执行操作
```

### 4. Token 持久化

Token 存储在输出目录的 `.catalog_token` 文件中。服务重启时：
- 读取已有 Token（浏览器页面无需重新加载即可继续发送控制请求）
- 首次启动时生成新 Token（`secrets.token_urlsafe(24)`）

### 5. 目录列表禁用

`CatalogHandler.list_directory()` 被覆盖为始终返回 403，防止目录浏览。

---

## 前端渲染管线

### 页面加载

```
浏览器请求 catalog.html
    │
    ▼
Jinja2 生成的 HTML 包含:
    ├── <link> catalog.css（@import 聚合 11 个 CSS 模块）
    ├── <script> window.CATALOG_CONFIG = {...}（内联 JSON）
    └── <script src="app.js" type="module">
    │
    ▼
app.js ES Module 执行:
    ├── initTheme()            # 读取 localStorage，应用暗色/亮色主题
    ├── initSidebarResize()    # 恢复侧边栏状态（展开/收起/宽度）
    ├── renderTree()           # 从 CONFIG.tree 构建 DOM 目录树
    ├── bindEvents()           # 绑定搜索、排序、快捷键、卡片点击等事件
    ├── initShortcuts()        # 注册全局键盘快捷键
    └── initContextMenu()      # 初始化右键菜单
```

### PDF 阅读流程（核心管线）

点击卡片封面时触发 `readPdf(card)`：

```
readPdf(card)
    │
    ├── 显示进度弹窗 (progress-overlay)
    │
    ├── 动态加载 ComicReader UMD 脚本
    │     └── <script src="vendor/ComicReader.umd.js">
    │
    ├── 动态导入 pdf.js ESM 模块
    │     └── import("vendor/pdfjs/pdf.min.mjs")
    │
    ├── 获取 PDF 数据
    │     ├── rangeSupport=true → PDF.getDocument(url)
    │     │     └── pdf.js 通过 HTTP Range 按需加载字节
    │     │     └── 失败时自动回退到全量下载
    │     │
    │     └── rangeSupport=false → fetch(url).arrayBuffer()
    │           └── PDF.getDocument({data: buffer})
    │
    ▼
renderPdf(pdf, card)
    │
    ├── 创建 AbortController（用于取消）
    │
    ├── 设置渲染参数:
    │     ├── pixelRatio = CONFIG.pixelRatio (默认 2)
    │     ├── concurrency = CONFIG.renderConcurrency (默认 2)
    │     ├── maxRenderWidth = CONFIG.maxRenderWidth (默认 1800)
    │     └── JPEG quality = CONFIG.jpegQuality (默认 0.88)
    │
    ├── 并发渲染循环（Promise 池模式）:
    │     │
    │     │  对于每一页 (1..N):
    │     │     ├── pdf.getPage(n)
    │     │     ├── page.getViewport({scale})
    │     │     ├── page.render({canvasContext, viewport})
    │     │     ├── canvas.toBlob("image/jpeg", jpegQuality)
    │     │     └── URL.createObjectURL(blob) → 写入对应页码槽位
    │     │
    │     ├── 前 initialRenderPages (默认 3) 页完成后:
    │     │     └── 立即打开 ComicRead 阅读器
    │     │         └── initComicReader({imgList, ...options})
    │     │
    │     └── 后续页面:
    │           └── 按页码顺序发布已完成页面 → CR.setProps("imgList", [...])
    │               增量追加到阅读器（不打断阅读位置）
    │
    ▼
用户退出阅读器:
    ├── AbortController.abort() → 取消后台渲染
    ├── URL.revokeObjectURL() × N → 释放内存
    └── 关闭进度弹窗
```

### ComicRead 集成

ComicRead 是第三方双页漫画阅读引擎（SolidJS），通过 UMD 包提供：

- **初始化**：`initComicReader(props)` 创建全屏阅读器实例
- **更新**：`CR.setProps("imgList", [...urls])` 动态追加页面
- **关闭**：`CR.setProps("show", false)` 销毁实例
- **配置持久化**：ComicRead 自身使用 `localStorage` 保存所有阅读设置

完整 API 类型定义参见 `static/vendor/ComicReader.umd.d.ts`。

### 状态管理

所有前端状态通过 `localStorage` 持久化：

| 键 | 类型 | 说明 |
|----|------|------|
| `@theme` | `"light"` / `"dark"` | 主题偏好 |
| `@sidebarState` | JSON | 侧边栏展开状态和宽度 |
| `@catalogSort` | `"name"` / `"time"` | 排序方式 |
| `@viewMode` | `"web"` / `"native"` | PDF 打开方式（macOS） |
| `@Option` / `@Version` / `@Hotkeys` | JSON | ComicRead 阅读器设置 |

---

## 配置系统

### 配置层级

```
优先级从高到低:

1. CLI 参数 (--enable-range / --disable-range / --port / --host)
2. 配置文件 (~/.comicreader/config.json 或 --config 指定路径)
3. 环境变量 (COMICREAD_RANGE_SUPPORT, COMICREAD_NO_BROWSER_OPEN)
4. 代码默认值 (lib/config.py 常量, builder.py catalog_config)
```

### 后端配置（`lib/config.py`）

| 常量 | 值 | 说明 |
|------|-----|------|
| `INDEX_FILE` | `"catalog_index.json"` | 索引文件名 |
| `HTML_FILE` | `"catalog.html"` | 生成的 HTML 文件名 |
| `EXCLUDE_DIRS` | `{"temp"}` | 扫描时排除的目录名 |
| `TOKEN_FILE` | `".catalog_token"` | 控制 Token 文件名 |
| `PROJECT_ROOT` | 自动计算 | 项目根目录（`lib/` 的父目录） |
| `STATIC_DIR` | `PROJECT_ROOT / "static"` | 前端资源目录 |
| `TEMPLATE_DIR` | `PROJECT_ROOT / "templates"` | 模板目录 |

### 前端配置（注入到 `window.CATALOG_CONFIG`）

在 `lib/builder.py` 的 `generate_html()` 中定义：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `tree` | `[]` | 嵌套目录树数据（侧边栏用） |
| `umdPath` | `"vendor/ComicReader.umd.js"` | ComicRead UMD 路径 |
| `pdfjsLocalPath` | `"vendor/pdfjs/pdf.min.mjs"` | pdf.js 模块路径 |
| `pdfjsWorkerPath` | `"vendor/pdfjs/pdf.worker.min.mjs"` | pdf.js Worker 路径 |
| `renderConcurrency` | `2` | 页面渲染并发数 |
| `pixelRatio` | `2` | Canvas 像素比率（支持高 DPI） |
| `initialRenderPages` | `3` | 打开阅读器前的最少渲染页数 |
| `maxRenderWidth` | `1800` | 单页渲染目标宽度上限 |
| `jpegQuality` | `0.88` | 阅读器页面 JPEG 输出质量 |
| `enablePerf` | `false` | 性能日志开关 |
| `serverControl` | `bool` | 是否启用服务端控制功能 |
| `shutdownToken` | `""` | 控制端点认证 Token |
| `nativeOpenEnabled` | `bool` | 是否启用 macOS Preview 打开 |
| `rangeSupport` | `bool` | 是否启用 HTTP Range |
| `shutdownPath` | `"/__shutdown"` | 关闭端点路径 |
| `refreshPath` | `"/__refresh"` | 刷新端点路径 |
| `nativeOpenPath` | `"/__open_native"` | Preview 打开端点路径 |
| `openRootPath` | `"/__open_root"` | 打开根目录端点路径 |
| `restartPath` | `"/__restart"` | 重启端点路径 |

### 环境变量

| 变量 | 取值 | 说明 |
|------|------|------|
| `COMICREAD_RANGE_SUPPORT` | `0` / `false` / `no` | 禁用 Range 支持（覆盖默认行为） |
| `COMICREAD_NO_BROWSER_OPEN` | `1` | 阻止自动打开浏览器（重启时使用） |

### 用户配置文件

默认路径 `~/.comicreader/config.json`，可通过 `--config` 指定其他路径，`--init-config` 自动生成模板。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `folder` | string | `""` | PDF 文件夹路径 |
| `host` | string | `"127.0.0.1"` | 监听地址 |
| `port` | int | `8080` | 端口号 |
| `serve` | bool | `true` | 是否自动启动 HTTP 服务 |
| `range_support` | bool | `true` | 是否启用 HTTP Range |
| `output_dir` | string | `""` | 自定义缓存目录（空则使用默认） |

---

## 存储与缓存策略

### 缓存目录结构

```
<output_dir>/
├── catalog.html               # 每次 rebuild 重新生成
├── catalog_index.json         # 增量索引（mtime + 封面文件名）
├── .catalog_token             # 控制 Token（跨重启持久化）
│
├── app.js                     # ↓ 以下由 copy_runtime_assets() 复制
├── catalog.css                #   CSS 源模块合并产物
├── modules/                   #   ES Module 子模块
├── vendor/
│   ├── ComicReader.umd.js
│   └── pdfjs/
│       ├── pdf.min.mjs
│       └── pdf.worker.min.mjs
│
└── images/                    # ↓ 封面缩略图
    ├── <title>-<sha1>.jpg     #   JPEG 150 DPI, quality 85
    └── ...
```

### 索引文件格式

`catalog_index.json`：

```json
{
  "漫画A/第1卷.pdf": {
    "mtime": 1700000000.0,
    "image": "第1卷-a1b2c3d4e5f6.jpg"
  },
  "漫画B/第2卷.pdf": {
    "mtime": 1700000100.0,
    "image": "第2卷-f6e5d4c3b2a1.jpg"
  }
}
```

- **键**：PDF 相对于根目录的 POSIX 路径
- **`mtime`**：文件修改时间（`float`，精度到秒）
- **`image`**：封面文件名，格式为 `<stem>-<sha1[:12]>.jpg`

### 封面文件命名

```
cover_filename("漫画A/第1卷.pdf")
    → stem = "第1卷"
    → digest = sha1("漫画A/第1卷.pdf")[:12]
    → "第1卷-<digest>.jpg"
```

SHA1 哈希确保同一路径总是生成相同的文件名，路径变化时文件名也随之变化。

### 缓存目录选择逻辑

```python
default_cache_dir(pdf_root):
    if root.name == "pdf":
        return root.parent / "workspace"     # 与 PDF 目录同级
    else:
        return ~/.cache/comicreader/<safe_path_key>
```

当 PDF 目录名为 `pdf` 时（常见的项目结构约定），缓存放在同级的 `workspace/` 目录中；否则放在用户缓存目录下，路径键由原始路径安全化处理得到。

### 废弃资源清理

`remove_deprecated_runtime_assets()` 在每次 `copy_runtime_assets()` 时执行，自动删除已从项目中移除的旧文件：

```python
DEPRECATED_RUNTIME_ASSETS = {
    "tag.js",
    "tag_ui.js",
    "page_notes.js",
    "css/tags.css",
    "css/page_notes.css",
}
```

> 如果未来移除了某个静态资源文件，应将其路径添加到此集合中，确保用户的缓存目录中不会残留旧文件。

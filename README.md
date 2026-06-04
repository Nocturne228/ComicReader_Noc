# ComicReadScript — Nocturne Manga

漫画 PDF 在线浏览 + 文件管理工具箱。基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 双页阅读引擎，支持 **macOS** 与 **Windows**。

## 项目结构

```
ComicReadScript/
│
├── catalog.py               # 入口：CLI 参数解析 + HTTP 服务启动
├── lib/                     # Python 逻辑模块
│   ├── config.py            #   常量、路径、排除目录
│   ├── utils.py             #   工具函数（文件名、索引、路径安全等）
│   ├── scanner.py           #   PDF 扫描、封面提取、缓存管理
│   ├── builder.py           #   HTML 目录生成、树形结构、rebuild
│   ├── server.py            #   HTTP 服务框架、路由表、静态文件白名单
│   ├── control_api.py       #   刷新、关闭、重启、Preview、工具接口
│   ├── tag_api.py           #   标签 HTTP 接口
│   ├── range_server.py      #   HTTP Range 响应
│   ├── security.py          #   控制 token 与请求路径规范化
│   ├── tag_manager.py       #   标签数据持久化
│   └── tool_runner.py       #   网页文件工具的命令构建与目录打开
│
├── static/
│   ├── catalog.css           # CSS 入口（@import 聚合子模块）
│   ├── css/                  # CSS 模块
│   │   ├── base.css          #   重置、变量、全局
│   │   ├── cards.css         #   卡片网格样式
│   │   ├── dropdown.css      #   下拉菜单样式
│   │   ├── layout.css        #   布局、侧边栏、主内容区
│   │   ├── progress.css      #   进度条、加载状态
│   │   ├── responsive.css    #   响应式适配
│   │   ├── shortcuts.css     #   快捷键帮助面板
│   │   ├── sidebar.css       #   侧边栏样式
│   │   ├── theme.css         #   主题、颜色变量
│   │   ├── toolbar.css       #   工具栏样式
│   │   └── tools.css         #   工具对话框、表单、输出
│   ├── catalog.js            # 主页面交互、阅读器、快捷键与全局状态
│   ├── tag.js                # 标签数据 API 与筛选逻辑
│   ├── tag_ui.js             # 标签面板、标签弹窗、右键菜单
│   ├── tools.js              # 工具弹窗、参数表单、SSE 输出与目录打开
│   └── vendor/               # ComicRead UMD + 本地 pdf.js，支持离线运行
│
├── templates/
│   └── catalog.html.j2       # 目录页 Jinja2 模板
│
├── script/
│   ├── x.py                  # PDF 尺寸批量缩放（备份到 x_backup/）
│   ├── y.py                  # PDF 页面处理：删页、提取 PNG、提取 PDF 区间
│   └── z.py                  # ZIP 压缩包批量→PDF（基于 ImageMagick）
│
├── LICENSE                   # AGPL-3.0 许可证
└── README.md
```

## 环境要求

### Python

- Python 3.8+
- 以下 Python 包：

```bash
pip install pypdf tqdm pdf2image jinja2 Pillow
```

### 系统依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| [poppler](https://poppler.freedesktop.org/) | pdf2image 提取 PDF 封面 | 见下方 |
| [ImageMagick](https://imagemagick.org/) | z.py ZIP→PDF 转换 | 见下方 |

#### macOS

```bash
brew install poppler imagemagick
```

#### Windows

```powershell
# poppler
# 1. 下载 https://github.com/oschwartz10612/poppler-windows/releases
# 2. 解压到 C:\poppler，将 C:\poppler\bin 加入系统 PATH

# ImageMagick
# 1. 下载 https://imagemagick.org/script/download.php#windows
# 2. 安装时勾选 "Install portable runtime"
# 3. 确保 magick 命令在终端中可用
```

#### Linux (备选)

```bash
sudo apt install poppler-utils imagemagick
```

## 快速开始

推荐把项目代码、漫画库和工具工作区放在同一个上级目录下：

```text
~/Documents/manga/
├── ComicReadScript/   # 本项目代码
├── pdf/               # 正式漫画库
└── workspace/         # 文件处理工作区
    ├── temp/
    ├── exports/
    └── logs/
```

```bash
# 启动 HTTP 服务
python catalog.py /path/to/pdf/folder --serve

# 推荐的本地个人漫画库启动方式
python catalog.py ~/Documents/manga/pdf --serve --work-dir ~/Documents/manga/workspace

# 浏览器访问（terminal 会输出实际地址）
# 默认 http://localhost:8080/output/catalog.html
```

> 首次运行会提取所有 PDF 封面，之后仅处理变更文件。
> 如果未指定 `--work-dir`，且 PDF 目录名为 `pdf`，程序会默认使用同级 `workspace/`。

## 命令行参考

```bash
python catalog.py [-h] [-s] [--host HOST] [-p PORT] [-o DIR] [--work-dir DIR] [--enable-range | --disable-range] folder

positional arguments:
  folder                PDF 文件夹路径（支持递归子目录）

options:
  -h, --help            显示帮助
  -s, --serve           启动 HTTP 服务
  --host HOST           监听地址（默认 127.0.0.1）
  -p PORT, --port PORT  端口（默认 8080）
  -o DIR, --output-dir  缓存目录（默认 ~/.cache/comicreader/…）
  --work-dir DIR        工具工作区目录（默认优先使用 PDF 同级 workspace/）
  --enable-range        启用 HTTP Range 支持，PDF 按需加载（默认，仅 --serve 模式）
  --disable-range       禁用 HTTP Range，强制全量 PDF 下载
```

> 环境变量 `COMICREAD_RANGE_SUPPORT=0` 可覆盖默认行为；非 `--serve` 模式下 Range 自动关闭。
> `--enable-range` 与 `--disable-range` 互斥，均不指定时默认启用（仅 serve 模式）。

## Web 界面功能

### 目录浏览

| 功能 | 操作 |
|------|------|
| 封面网格 | 按文件夹分组展示所有 PDF 首页缩略图 |
| 目录树 | 左侧边栏可折叠树形目录，点击跳转并高亮 |
| 搜索过滤 | 侧边栏输入关键词实时过滤（同时过滤侧边栏和卡片网格） |
| 排序 | 按名称 / 按修改时间 |
| 侧边栏控制 | `◀` 收起，`☰` 展开，拖拽调整宽度，状态自动记忆 |

### 键盘快捷键

按 `?` 随时查看全屏快捷键帮助面板：

| 快捷键 | 功能 |
|--------|------|
| `?` | 显示 / 隐藏快捷键帮助面板 |
| `Esc` | 关闭面板 / 对话框 / 取消搜索框焦点 |
| `/` | 聚焦搜索框 |
| `B` | 收起 / 展开侧边栏 |
| `F` | 全部展开 / 折叠目录 |
| `V` | 切换网页阅读 / Preview 打开（macOS） |
| `C` | 重置阅读设置 |
| `X` | 打开 PDF 缩放工具 |
| `Y` | 打开 PDF 裁剪工具 |
| `Z` | 打开 ZIP→PDF 工具 |
| `R` | 刷新目录 |

> 按住 `Cmd` / `Ctrl` 时快捷键自动放行，不干扰浏览器原生快捷键。

### 在线阅读

| 功能 | 说明 |
|------|------|
| 双页阅读 | 鼠标悬停封面 → 点击进入双页阅读器 |
| 懒加载渲染 | 页面渐进式渲染，前 N 页完成后立即打开阅读器，其余页面后台继续渲染 |
| HTTP Range 支持 | `--serve` 模式下 pdf.js 直接通过 Range 请求流式加载 PDF，首屏延迟可忽略 |
| 增量更新 | 阅读器打开后每完成一页自动追加到阅读列表，不打断当前阅读位置 |
| 退出取消 | 退出阅读器时后台渲染线程自动终止并关闭进度弹窗 |
| 卡片 loading 态 | 点击卡片后封面半透明遮罩表示加载中 |
| 翻页/缩放 | 滚轮 / 空格 / 方向键 / 双击 / `Esc` 退出 |
| macOS Preview | `--serve` 模式下切换「网页阅读 / Preview 打开」 |
| 设置持久化 | `localStorage` 自动保存，不丢失 |

> 渲染并发数、像素比率、JPEG 质量等参数可通过 `CONFIG.renderConcurrency` / `CONFIG.enablePerf` / `CONFIG.initialRenderPages` 嵌入配置调整（参见 `lib/builder.py`）。

### 文件管理工具

工具栏三个按钮仅在 `--serve` 模式下可用：

| 工具 | 功能 |
|------|------|
| **PDF缩放** | 批量统一页面尺寸。支持 A4 预设 / 自定义 / 条形漫画模式 |
| **PDF裁剪** | 批量删除页面，也支持从指定 PDF 提取单页 PNG 或页码范围 PDF |
| **ZIP→PDF** | 解压 ZIP 中的图片并合成为 PDF，支持黑白 600 DPI / 彩色 300 DPI |

每个工具对话框提供：

- **目标目录选择** — 分为“工作区”和“漫画库”，默认指向工作区 `temp/`
- **实时流式输出** — 脚本执行日志逐行即时显示，无需等待完成
- **打开目录** — 随时在文件管理器中打开当前选中的文件夹
- **清理备份** — 一键删除工具生成的备份目录

### 系统操作

| 按钮 | 说明 |
|------|------|
| 刷新目录 | 重新扫描 PDF 文件夹，更新封面和索引 |
| 重置阅读 | 清除阅读器设置缓存 |
| 重启服务 | 重启 HTTP 服务并在当前标签页等待恢复 |
| 关闭服务 | 从网页端关闭本地 HTTP 服务 |

### 标签系统

标签系统允许你为漫画添加自定义标签，便于分类和检索。

| 功能 | 操作 |
|------|------|
| 显示/隐藏标签 | 工具栏点击 🏷️ 标签 按钮 |
| 编辑标签 | 右键点击卡片封面 → 编辑标签 |
| 标签筛选 | 侧边栏标签面板点击标签，或搜索框输入 `:标签名` |
| 混合搜索 | 搜索框输入 `:恋爱 热血` 同时匹配标签和标题 |

**标签管理**：
- 右键点击卡片封面，选择「编辑标签...」打开标签编辑对话框
- 在对话框中可以添加、删除标签，或从已有标签中快速选择
- 标签编辑需要通过 `--serve` 启动本地服务；静态 HTML 可显示和筛选已生成的标签，但不能修改
- 标签数据存储在缓存目录的 `tags.json` 文件中，保存时会原子替换，并保留最近一次 `tags.json.bak` 备份
- 刷新目录时会清理已删除 PDF 的标签；如果 PDF 移动后文件名仍唯一，会自动迁移标签到新路径

**搜索语法**：
- `:标签名` — 只显示包含该标签的漫画
- `:标签1 :标签2` — 显示同时包含两个标签的漫画
- `关键词 :标签` — 标题包含关键词且有指定标签的漫画

## 文件管理工具（独立 CLI）

三个脚本也可脱离网页直接在终端使用。

## 开发检查

```bash
python3 -m py_compile catalog.py lib/*.py script/*.py tests/*.py
python3 -m unittest discover -s tests
node --check static/catalog.js
node --check static/tag.js
node --check static/tag_ui.js
node --check static/tools.js
```

### x.py — PDF 尺寸缩放

```bash
python script/x.py /path/to/folder              # 默认 A4 (210×297mm)
python script/x.py /path/to/folder -w 210 -H 297
python script/x.py /path/to/folder -s            # 条形漫画模式（高度自适应）
python script/x.py /path/to/folder --clean       # 清理所有 x_backup/
python script/x.py /path/to/folder --open        # 完成后打开 Finder/Explorer
```

### y.py — PDF 页面处理

```bash
python script/y.py /path/to/folder -s 3          # 删除第 3 页
python script/y.py /path/to/folder -r 5          # 删除前 5 页
python script/y.py /path/to/folder -r 3 -b       # 删除后 3 页
python script/y.py /path/to/folder --file book.pdf --extract-png 5 --dpi 300
python script/y.py /path/to/folder --file book.pdf --extract-pdf 10 20
python script/y.py /path/to/folder --file book.pdf --extract-pdf 10 20 -o part.pdf
python script/y.py /path/to/folder --clean       # 清理所有 y_backup/
```

### z.py — ZIP→PDF 转换

```bash
python script/z.py /path/to/folder               # 转换所有 ZIP
python script/z.py /path/to/folder --dpi-mode color  # 彩色输出，300 DPI
python script/z.py /path/to/folder --dpi-mode bw     # 黑白输出，600 DPI（默认）
python script/z.py /path/to/folder --clean       # 删除目录中的 ZIP 文件
```

### 通用选项

| 选项 | 说明 |
|------|------|
| `--open` | 操作完成后用系统默认文件管理器打开目标目录 |
| `--clean` | 清理本工具对应的备份/转换产物（不执行处理） |
| `--dpi-mode color\|bw` | 仅 `z.py` 使用；彩色 300 DPI，黑白 600 DPI，默认 `bw` |
| `--file PDF` | 仅 `y.py` 提取操作使用；可填写相对目标目录的 PDF 路径 |
| `--extract-png PAGE` | 仅 `y.py` 使用；提取指定页为 PNG |
| `--extract-pdf START END` | 仅 `y.py` 使用；提取页码范围为单独 PDF |
| `-o, --output` | 仅 `y.py` 提取操作使用；相对路径按源 PDF 所在目录解析 |

## 排除目录

以下名称的目录会被自动跳过（不展示、不索引）：

- `x_backup` — x.py 备份目录
- `y_backup` — y.py 备份目录
- `temp` — 旧版临时处理目录；新版默认使用独立 `workspace/temp`

## 性能优化

针对 Windows 及资源受限设备的优化，已在 `windows-opt` 分支默认应用：

| 优化 | 改动 | 效果 |
|------|------|------|
| 渲染并发数 | `CONFIG.renderConcurrency` 默认 2（可配置） | 降低 CPU 上下文切换 |
| 像素比率 | `CONFIG.pixelRatio` 默认 2（可配置，支持高 DPI） | 保持高质量图像输出 |
| JPEG 质量 | 0.92，高质量输出 | 保持优秀图像质量 |
| 惰性渲染 | 只渲染前 N 页即打开阅读器，其余后台渐进 | 首屏延迟 ↓ 80-90% |
| HTTP Range | pdf.js 按需加载 PDF 字节范围，自动回退到全量下载 | 无需等待全量下载 |

### 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `renderConcurrency` | 2 | 渲染并发数，控制同时渲染的页面数量 |
| `pixelRatio` | 2 | 像素比率，支持高 DPI 显示 |
| `initialRenderPages` | 3 | 初始渲染页数，打开阅读器前渲染的页面数量 |
| `enablePerf` | false | 性能模式，启用后优化渲染性能 |

> 详细对比数据参见 `WINDOWS_OPT.md`。

## 数据规范

### 缓存目录结构

PDF 源文件不会被修改。生成的缓存位于默认 `~/.cache/comicreader/<路径名>/` 或 `--output-dir`：

```
~/.cache/comicreader/<路径名>/
├── catalog.html               # 目录 HTML 页面
├── catalog.css                # 目录样式（自动复制）
├── catalog.js                 # 主页面交互脚本（自动复制）
├── tag.js                     # 标签数据脚本（自动复制）
├── tag_ui.js                  # 标签界面脚本（自动复制）
├── tools.js                   # 工具界面脚本（自动复制）
├── catalog_index.json         # 处理缓存
├── vendor/
│   ├── ComicReader.umd.js     # 阅读器 UMD（自动复制）
│   └── pdfjs/                 # pdf.js 与 worker（离线可用）
└── images/
    ├── <title>-<hash>.jpg     # PDF 封面（JPEG, 150 DPI）
    └── ...
```

> 缓存目录可随时删除，下次运行自动重建。

### 增量更新

| 事件 | 行为 |
|------|------|
| 新增 PDF | 提取封面并加入索引 |
| 修改 PDF | 重新提取封面（mtime 变更检测） |
| 移动/重命名 | 同名 + 同 mtime 自动迁移索引条目 |
| 删除 PDF | 清理对应封面图片和索引条目 |

## 工作流程

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│ Python 端    │     │ 浏览器端           │     │ 浏览器端         │
│ (catalog.py) │     │ (catalog.html/js)  │     │ (ComicRead UMD)  │
├──────────────┤     ├────────────────────┤     ├──────────────────┤
│ pdf2image    │────▶│ 封面缩略图          │     │                  │
│ 提取首页     │     │                    │     │                  │
│              │     │ 点击封面 ─────────▶│ ① 渐进式渲染前 N 页 │
│ Jinja2       │     │                    │ ② 早开阅读器        │
│ 生成 HTML    │────▶│                    │ ③ 后台增量渲染      │
│              │     │                    │ ④ 逐页追加到阅读器  │
│ HTTP 服务    │◀───▶│ Range/全量 PDF     │ ⑤ 双页/缩放/翻译   │
│ (Range 可选) │     │ 按需加载            │                     │
└──────────────┘     └────────────────────┘     └──────────────────┘
```

1. **Python** 递归遍历 PDF 文件夹，`pdf2image` 提取首页封面，`Jinja2` 生成 HTML（支持 `rangeSupport` 配置注入）
2. **浏览器** 加载 HTML 展示分组封面网格和可折叠目录树；搜索框同时过滤侧边栏和卡片
3. 点击封面时，**pdfjs-dist** 通过 Full Download 或 HTTP Range 流式加载 PDF 数据，渐进式逐页渲染
4. 前 N 页渲染完成后立即打开 **ComicRead** 阅读器，其余页面在后台继续渲染并增量追加
5. 退出阅读器时自动取消后台渲染线程，不浪费资源

## 注意事项

- `--serve` 模式下所有 POST 操作需要 `X-ComicReader-Token` 验证头（页面自动携带）
- macOS Preview 打开功能仅限 `--serve` 模式
- z.py 依赖 ImageMagick，需 `magick` 命令可用
- pdf2image 依赖 poppler，需 `pdftoppm` 命令可用

## 许可证

[AGPL-3.0-or-later](LICENSE) — 基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 构建。

## 致谢

- [ComicRead](https://github.com/hymbz/ComicReadScript) — 双页漫画阅读油猴脚本
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — Mozilla 浏览器端 PDF 渲染引擎

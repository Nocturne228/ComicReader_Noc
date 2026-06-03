# ComicReadScript — Nocturne Manga

漫画 PDF 在线浏览 + 文件管理工具箱。基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 双页阅读引擎，支持 **macOS** 与 **Windows**。

## 项目结构

```
ComicReadScript/
├── catalog.py              # 核心脚本：PDF 目录生成 + HTTP 服务
├── templates/
│   └── catalog.html.j2      # 目录页 Jinja2 模板
├── static/
│   ├── catalog.css          # 目录页样式
│   ├── catalog.js           # 目录页交互与 PDF 渲染入口
│   └── vendor/pdfjs/        # 本地 pdf.js 运行文件，支持离线解析 PDF
├── script/
│   ├── x.py                 # PDF 尺寸批量缩放（备份到 x_backup/）
│   ├── y.py                 # PDF 页面批量裁剪（备份到 y_backup/）
│   └── z.py                 # ZIP 压缩包批量→PDF（基于 ImageMagick）
├── ComicReader.umd.js       # ComicRead 阅读器 UMD 包（浏览器端）
├── LICENSE                  # AGPL-3.0 许可证
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

```bash
# 启动 HTTP 服务
python catalog.py /path/to/pdf/folder --serve

# 浏览器访问（terminal 会输出实际地址）
# 默认 http://localhost:8080/output/catalog.html
```

> 首次运行会提取所有 PDF 封面，之后仅处理变更文件。

## 命令行参考

```bash
python catalog.py [-h] [-s] [--host HOST] [-p PORT] [-o DIR] folder

positional arguments:
  folder                PDF 文件夹路径（支持递归子目录）

options:
  -h, --help            显示帮助
  -s, --serve           启动 HTTP 服务
  --host HOST           监听地址（默认 127.0.0.1）
  -p PORT, --port PORT  端口（默认 8080）
  -o DIR, --output-dir  缓存目录（默认 ~/.cache/comicreader/…）
```

## Web 界面功能

### 目录浏览

| 功能 | 操作 |
|------|------|
| 封面网格 | 按文件夹分组展示所有 PDF 首页缩略图 |
| 目录树 | 左侧边栏可折叠树形目录，点击跳转并高亮 |
| 搜索过滤 | 侧边栏输入关键词实时过滤 |
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
| 翻页/缩放 | 滚轮 / 空格 / 方向键 / 双击 / `Esc` 退出 |
| macOS Preview | `--serve` 模式下切换「网页阅读 / Preview 打开」 |
| 设置持久化 | `localStorage` 自动保存，不丢失 |

### 文件管理工具

工具栏三个按钮仅在 `--serve` 模式下可用：

| 工具 | 功能 |
|------|------|
| **PDF缩放** | 批量统一页面尺寸。支持 A4 预设 / 自定义 / 条形漫画模式 |
| **PDF裁剪** | 批量删除指定页面。支持单页 / 连续多页 / 从后往前 |
| **ZIP→PDF** | 解压 ZIP 中的图片并合成为 PDF |

每个工具对话框提供：

- **目标目录选择** — 从目录树加载，默认指向 `temp/`
- **实时流式输出** — 脚本执行日志逐行即时显示，无需等待完成
- **打开目录** — 随时在文件管理器中打开当前选中的文件夹
- **清理备份** — 一键删除工具生成的备份目录

### 系统操作

| 按钮 | 说明 |
|------|------|
| 刷新目录 | 重新扫描 PDF 文件夹，更新封面和索引 |
| 重置阅读 | 清除阅读器设置缓存 |
| 关闭服务 | 从网页端关闭本地 HTTP 服务 |

## 文件管理工具（独立 CLI）

三个脚本也可脱离网页直接在终端使用。

### x.py — PDF 尺寸缩放

```bash
python script/x.py /path/to/folder              # 默认 A4 (210×297mm)
python script/x.py /path/to/folder -w 210 -H 297
python script/x.py /path/to/folder -s            # 条形漫画模式（高度自适应）
python script/x.py /path/to/folder --clean       # 清理所有 x_backup/
python script/x.py /path/to/folder --open        # 完成后打开 Finder/Explorer
```

### y.py — PDF 页面裁剪

```bash
python script/y.py /path/to/folder -s 3          # 删除第 3 页
python script/y.py /path/to/folder -r 5          # 删除前 5 页
python script/y.py /path/to/folder -r 3 -b       # 删除后 3 页
python script/y.py /path/to/folder --clean       # 清理所有 y_backup/
```

### z.py — ZIP→PDF 转换

```bash
python script/z.py /path/to/folder               # 转换所有 ZIP
python script/z.py /path/to/folder --clean       # 删除转换生成的 PDF
```

### 通用选项

| 选项 | 说明 |
|------|------|
| `--open` | 操作完成后用系统默认文件管理器打开目标目录 |
| `--clean` | 清理本工具对应的备份/转换产物（不执行处理） |

## 排除目录

以下名称的目录会被自动跳过（不展示、不索引）：

- `x_backup` — x.py 备份目录
- `y_backup` — y.py 备份目录
- `temp` — 临时处理目录（工具默认以此为目标）

## 数据规范

### 缓存目录结构

PDF 源文件不会被修改。生成的缓存位于默认 `~/.cache/comicreader/<路径名>/` 或 `--output-dir`：

```
~/.cache/comicreader/<路径名>/
├── catalog.html               # 目录 HTML 页面
├── catalog.css                # 目录样式（自动复制）
├── catalog.js                 # 目录交互脚本（自动复制）
├── catalog_index.json         # 处理缓存
├── ComicReader.umd.js         # 阅读器 UMD（自动复制）
├── vendor/pdfjs/              # pdf.js 与 worker（离线可用）
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
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│ Python 端    │     │ 浏览器端      │     │ 浏览器端         │
│ (catalog.py) │     │ (catalog.html)│     │ (ComicRead UMD)  │
├──────────────┤     ├───────────────┤     ├──────────────────┤
│ pdf2image    │────▶│ 封面缩略图    │     │                  │
│ 提取首页     │     │               │     │                  │
│              │     │ 点击封面 ────▶│ ① fetch PDF 数据    │
│ Jinja2       │     │               │ ② pdfjs-dist 渲染   │
│ 生成 HTML    │────▶│               │ ③ 每页转为 Canvas   │
│              │     │               │ ④ ComicRead 阅读器  │
│ HTTP 服务    │◀───▶│ 请求 PDF/img  │ ⑤ 双页/缩放/翻译   │
└──────────────┘     └───────────────┘     └──────────────────┘
```

1. **Python** 递归遍历 PDF 文件夹，`pdf2image` 提取首页封面，`Jinja2` 生成 HTML
2. **浏览器** 加载 HTML 展示分组封面网格和可折叠目录树
3. 点击封面时，本地 **pdfjs-dist** 将 PDF 每页渲染为图片
4. 渲染完成调用 **ComicRead UMD** 的 `initComicReader()` 挂载双页阅读器

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

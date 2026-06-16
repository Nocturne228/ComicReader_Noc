# ComicReadScript — Nocturne Manga

漫画 PDF 在线浏览 + 文件管理工具箱。基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 双页阅读引擎，支持 **macOS** 与 **Windows**。

## 文档

| 文档 | 内容 |
|------|------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发者指南：环境搭建、编码规范、测试、功能扩展示例 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构文档：模块依赖、数据流转、安全模型、前端渲染管线 |

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
│   ├── control_api.py       #   刷新、关闭、重启、Preview、打开根目录
│   ├── range_server.py      #   HTTP Range 响应
│   └── security.py          #   控制 token 与请求路径规范化
│
├── static/
│   ├── catalog.css           # CSS 入口（@import 聚合子模块）
│   ├── css/                  # CSS 模块
│   │   ├── base.css          #   重置、变量、全局
│   │   ├── cards.css         #   卡片网格样式
│   │   ├── dropdown.css      #   下拉菜单样式
│   │   ├── layout.css        #   布局、侧边栏、主内容区
│   │   ├── modal.css         #   模态对话框、右键菜单
│   │   ├── progress.css      #   进度条、加载状态
│   │   ├── responsive.css    #   响应式适配
│   │   ├── shortcuts.css     #   快捷键帮助面板
│   │   ├── sidebar.css       #   侧边栏样式
│   │   ├── theme.css         #   主题、颜色变量
│   │   └── toolbar.css       #   工具栏样式
│   ├── catalog.js            # 主页面交互、阅读器、快捷键与全局状态
│   ├── context_menu.js       # 右键菜单
│   └── vendor/               # ComicRead UMD + 本地 pdf.js，支持离线运行
│
├── templates/
│   └── catalog.html.j2       # 目录页 Jinja2 模板
│
├── tests/                    # 单元测试
│   ├── test_builder.py
│   ├── test_paths.py
│   └── test_server_helpers.py
│
├── CONTRIBUTING.md           # 开发者指南
├── ARCHITECTURE.md           # 架构文档
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

#### macOS

```bash
brew install poppler
```

#### Windows

```powershell
# poppler
# 1. 下载 https://github.com/oschwartz10612/poppler-windows/releases
# 2. 解压到 C:\poppler，将 C:\poppler\bin 加入系统 PATH
```

#### Linux (备选)

```bash
sudo apt install poppler-utils
```

## 快速开始

```bash
# 启动 HTTP 服务
python catalog.py /path/to/pdf/folder --serve

# 推荐的本地个人漫画库启动方式
python catalog.py ~/Documents/manga/pdf --serve

# 浏览器访问（terminal 会输出实际地址）
# 默认 http://localhost:8080/output/catalog.html
```

> 首次运行会提取所有 PDF 封面，之后仅处理变更文件。

## 命令行参考

```bash
python catalog.py [-h] [-s] [--host HOST] [-p PORT] [-o DIR] [--enable-range | --disable-range] [--config PATH] [--init-config] [folder]

positional arguments:
  folder                PDF 文件夹路径（可省略，从配置文件读取）

options:
  -h, --help            显示帮助
  -s, --serve           启动 HTTP 服务
  --host HOST           监听地址（默认 127.0.0.1）
  -p PORT, --port PORT  端口（默认 8080）
  -o DIR, --output-dir  缓存目录（默认 ~/.cache/comicreader/…）
  --enable-range        启用 HTTP Range 支持，PDF 按需加载（默认，仅 --serve 模式）
  --disable-range       禁用 HTTP Range，强制全量 PDF 下载
  --config PATH         配置文件路径（默认 ~/.comicreader/config.json）
  --init-config         生成默认配置文件并退出
```

> 优先级：命令行参数 > 配置文件 > 默认值。
> 环境变量 `COMICREAD_RANGE_SUPPORT=0` 可覆盖默认行为；非 `--serve` 模式下 Range 自动关闭。
> `--enable-range` 与 `--disable-range` 互斥，均不指定时默认启用（仅 serve 模式）。

### 配置文件

首次使用可生成默认配置文件：

```bash
python catalog.py --init-config
# 编辑 ~/.comicreader/config.json，设置 folder 路径
python catalog.py   # 无需任何参数即可启动
```

配置文件字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `folder` | string | `""` | PDF 文件夹路径 |
| `host` | string | `"127.0.0.1"` | 监听地址 |
| `port` | int | `8080` | 端口号 |
| `serve` | bool | `true` | 是否自动启动 HTTP 服务 |
| `range_support` | bool | `true` | 是否启用 HTTP Range |
| `output_dir` | string | `""` | 自定义缓存目录（空则使用默认） |

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
| `R` | 刷新目录 |
| `P` | 重启服务 |

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

### 系统操作

| 按钮 | 说明 |
|------|------|
| 刷新目录 | 重新扫描 PDF 文件夹，更新封面和索引 |
| 重置阅读 | 清除阅读器设置缓存 |
| 重启服务 | 重启 HTTP 服务并在当前标签页等待恢复 |
| 关闭服务 | 从网页端关闭本地 HTTP 服务 |

## 开发检查

```bash
python3 -m py_compile catalog.py lib/*.py tests/*.py
python3 -m unittest discover -s tests
node --check static/catalog.js
node --check static/context_menu.js
```

> 详细的开发环境搭建、编码规范和功能扩展指南请参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 排除目录

以下名称的目录会被自动跳过（不展示、不索引）：

- `temp` — 临时处理目录

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
├── context_menu.js            # 右键菜单脚本（自动复制）
├── catalog_index.json         # 处理缓存
├── css/                       # CSS 子模块（自动复制）
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
- pdf2image 依赖 poppler，需 `pdftoppm` 命令可用

## 许可证

[AGPL-3.0-or-later](LICENSE) — 基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 构建。

## 致谢

- [ComicRead](https://github.com/hymbz/ComicReadScript) — 双页漫画阅读油猴脚本
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — Mozilla 浏览器端 PDF 渲染引擎

# ComicReader Noc

基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 双页阅读引擎的 PDF 漫画本地阅读方案。将 PDF 文件夹一键生成带封面的浏览器目录页，点击即可在双页阅读器中浏览。

## 项目结构

```
ComicReader_Noc/
├── catalog.py              # 核心脚本：PDF 目录生成 + HTTP 服务
├── ComicReader.umd.js      # ComicRead 阅读器 UMD 包（浏览器端）
├── ComicReader.umd.d.ts    # TypeScript 类型声明
├── LICENSE                 # AGPL-3.0 许可证
└── README.md
```

## 环境要求

### Python

- Python 3.8+
- Conda 环境 `ai`（需已安装以下包）：

```bash
conda activate ai
pip install jinja2 pdf2image tqdm
```

### 系统

- [poppler](https://poppler.freedesktop.org/)（pdf2image 依赖）

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt install poppler-utils
```

## 快速开始

```bash
# 1. 激活环境
conda activate ai

# 2. 生成目录页
python catalog.py /path/to/pdf/folder

# 3. 生成目录页 + 启动本地 HTTP 服务（推荐）
python catalog.py /path/to/pdf/folder --serve

# 4. 指定端口
python catalog.py /path/to/pdf/folder --serve --port 9999
```

浏览器打开 `http://localhost:8080/output/catalog.html`。

## 使用教程

### 目录页功能

| 功能 | 操作 |
|------|------|
| 浏览 PDF 封面 | 页面加载后自动显示所有 PDF 的首页缩略图 |
| 阅读 PDF | 鼠标悬停封面 → 出现播放按钮 → 点击进入双页阅读器 |
| 目录跳转 | 左侧边栏列出所有 PDF 标题，点击跳转并高亮对应卡片 |
| 搜索过滤 | 侧边栏搜索框输入关键词，实时过滤标题 |
| 排序切换 | 顶部下拉菜单：按名称 / 按修改时间 |
| 侧边栏收起 | 点击侧边栏右上角 `◀` 收起，左侧出现 `☰` 展开 |

### 阅读器功能

进入 ComicRead 阅读器后：

- **双页阅读**：自动合并跨页大图，智能填充空白页
- **翻页**：滚轮 / 空格 / 方向键 / PageUp/PageDown
- **缩放**：双击 / Alt + 滚轮
- **退出阅读**：点击左上角「← 返回目录」按钮 / `Esc` 键
- 阅读器设置面板位于阅读模式内左侧边栏

### 配置持久化

阅读器的所有设置（页面填充、暗色模式、缩放等）保存在浏览器 `localStorage` 中，关闭浏览器后不丢失。点击「清除阅读器缓存」按钮可重置。

## 数据规范

### catalog_index.json

脚本在 `output/catalog_index.json` 中维护 PDF 处理缓存，避免每次重新提取封面。

```json
{
  "filename1.pdf": {
    "mtime": 1717200000.0,
    "image": "filename1.png"
  },
  "filename2.pdf": {
    "mtime": 1717200001.0,
    "image": "filename2.png"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | string | PDF 文件名（含扩展名） |
| `mtime` | float | 文件修改时间戳，用于增量更新检测 |
| `image` | string | 对应封面 PNG 文件名 |

### 输出目录结构

```
/pdf/folder/
├── a.pdf                          # 原始 PDF 文件（不修改）
├── b.pdf
└── output/                        # 生成目录（可安全删除重建）
    ├── catalog.html               # 目录 HTML 页面
    ├── catalog_index.json         # 处理缓存
    ├── ComicReader.umd.js         # 阅读器 UMD（自动复制）
    └── images/
        ├── a.png                  # PDF 首页封面（180 DPI）
        └── b.png
```

> `output/` 目录可随时删除，下次运行 `catalog.py` 会自动重建。原始 PDF 文件不会被修改。

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

1. **Python** 遍历 PDF 文件夹，用 `pdf2image` 提取首页封面，通过 `Jinja2` 模板生成 HTML
2. **浏览器** 加载 HTML 后展示封面网格和侧边栏目录
3. 点击封面时，浏览器端 **pdfjs-dist**（CDN 加载）将 PDF 每页渲染为图片
4. 渲染完成后调用 **ComicRead UMD** 的 `initComicReader()` 挂载双页阅读器

## 命令行参考

```
usage: catalog.py [-h] [--serve] [--port PORT] folder

positional arguments:
  folder                PDF 文件夹路径

options:
  -h, --help            显示帮助
  -s, --serve           启动 HTTP 服务以便在线阅读
  -p PORT, --port PORT  指定 HTTP 端口（默认 8080）
```

## 许可证

[AGPL-3.0-or-later](LICENSE) — 基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 构建。

## 致谢

- [ComicRead](https://github.com/hymbz/ComicReadScript) — 双页漫画阅读油猴脚本
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — Mozilla 浏览器端 PDF 渲染引擎

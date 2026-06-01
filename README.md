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

# 2. 进入项目目录，生成并启动服务
cd ComicReader_Noc
python catalog.py /path/to/pdf/folder --serve

# 3. 浏览器访问
open http://localhost:8080/output/catalog.html
```

> 首次运行会提取所有 PDF 封面，之后再次运行仅处理变更文件。

## 便捷命令

在 `~/.zshrc` 中添加 alias，之后可在任意目录一键启动：

```bash
echo "alias comic='cd $PWD && conda run -n ai python catalog.py'" >> ~/.zshrc
```

```bash
# 用法
comic ~/Documents/manga --serve
comic ~/Documents/manga --serve -p 9999
```

## 命令行参考

```
usage: catalog.py [-h] [--serve] [--port PORT] [--output-dir OUTPUT_DIR] folder

positional arguments:
  folder                 PDF 文件夹路径（支持递归子目录）

options:
  -h, --help             显示帮助
  -s, --serve            启动 HTTP 服务以便在线阅读
  -p PORT, --port PORT   指定 HTTP 端口（默认 8080）
  -o DIR, --output-dir DIR
                         缓存目录（默认 ~/.cache/comicreader/<路径>）
```

## 界面功能

### 目录页

| 功能 | 操作 |
|------|------|
| 浏览 PDF 封面 | 页面加载后按分组展示所有 PDF 的首页缩略图 |
| 阅读 PDF | 鼠标悬停封面 → 出现播放按钮 → 点击进入双页阅读器 |
| 目录树跳转 | 左侧边栏可折叠目录树，点击 PDF 条目跳转并高亮对应卡片 |
| 展开/折叠分组 | 点击分组标题（📂）收起/展开该文件夹的 PDF 卡片 |
| 一键全部展开/折叠 | 工具栏 `⊞` / `⊟` 按钮同时控制侧边栏树和主界面分组 |
| 搜索过滤 | 侧边栏搜索框输入关键词，实时过滤目录树 |
| 排序切换 | 顶部下拉菜单：按名称 / 按修改时间 |
| 侧边栏控制 | `◀` 收起侧边栏，`☰` 展开；状态自动记忆 |

### 阅读器

进入 ComicRead 阅读器后：

- **双页阅读**：自动合并跨页大图，智能填充空白页
- **翻页**：滚轮 / 空格 / 方向键 / PageUp/PageDown
- **缩放**：双击 / Alt + 滚轮
- **退出阅读**：点击左上角「← 返回目录」按钮 / `Esc` 键
- 阅读器设置面板位于阅读模式内左侧边栏

### 配置持久化

阅读器的所有设置保存在浏览器 `localStorage` 中，关闭后不丢失。点击 `✕` 按钮可重置缓存。

## 数据规范

### 目录结构

PDF 源文件夹自行管理，脚本不修改任何源文件。生成的缓存位于默认位置或 `--output-dir` 指定目录：

```
~/.cache/comicreader/<路径名>/
├── catalog.html               # 目录 HTML 页面
├── catalog_index.json         # 处理缓存
├── ComicReader.umd.js         # 阅读器 UMD（自动复制）
└── images/
    ├── a.jpg                  # PDF 首页封面（JPEG, 150 DPI, ~20KB/张）
    ├── sub__b.jpg             # 子目录文件用 __ 分隔路径
    └── ...
```

> 缓存目录可随时删除，下次运行自动重建。

### catalog_index.json

维护 PDF 处理缓存，键为 PDF 相对于源文件夹的路径，避免重复提取封面。

```json
{
  "a.pdf": {
    "mtime": 1717200000.0,
    "image": "a.jpg"
  },
  "sub/b.pdf": {
    "mtime": 1717200001.0,
    "image": "sub__b.jpg"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | string | PDF 相对路径（含扩展名），用 `/` 分隔子目录 |
| `mtime` | float | 文件修改时间戳，用于增量更新、移动检测 |
| `image` | string | 对应封面 JPEG 文件名（路径中 `/` 替换为 `__`） |

### 增量更新机制

- **新增 PDF**：提取封面并加入索引
- **修改 PDF**（mtime 变化）：重新提取封面
- **移动/重命名**：同名 + 同 mtime 自动迁移索引条目，无需重提
- **删除 PDF**：清理对应封面图片和索引条目

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
3. 点击封面时，**pdfjs-dist**（CDN）将 PDF 每页渲染为图片
4. 渲染完成调用 **ComicRead UMD** 的 `initComicReader()` 挂载双页阅读器

## 许可证

[AGPL-3.0-or-later](LICENSE) — 基于 [ComicRead](https://github.com/hymbz/ComicReadScript) 构建。

## 致谢

- [ComicRead](https://github.com/hymbz/ComicReadScript) — 双页漫画阅读油猴脚本
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — Mozilla 浏览器端 PDF 渲染引擎

# ComicRead — PDF Catalog Reader

在浏览器中用 ComicRead 双页阅读器本地阅读 PDF 漫画。

## 使用

```bash
# 需要 conda ai 环境 (pdf2image, jinja2, tqdm)
conda activate ai

# 生成 PDF 目录页并启动 HTTP 服务
python catalog.py /path/to/pdf/folder --serve

# 指定端口
python catalog.py /path/to/pdf/folder --serve --port 9999

# 仅生成目录（不带 HTTP 服务）
python catalog.py /path/to/pdf/folder
```

浏览器打开 `http://localhost:8080`，点击卡片上的「阅读」即可在 ComicRead 阅读器中以双页模式浏览 PDF。

## 文件说明

- `catalog.py` — PDF 目录生成脚本
- `ComicReader.umd.js` — ComicRead 双页阅读器（浏览器端 UMD 模块）

## 依赖

- Python 3.8+ + `conda activate ai`（pdf2image / jinja2 / tqdm）
- 浏览器加载 ComicRead 阅读器时自动从 CDN 拉取 pdfjs-dist

#!/usr/bin/env python3
import json, re, shutil, sys, webbrowser
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from jinja2 import Template
from pdf2image import convert_from_path
from tqdm import tqdm

INDEX_FILE = "catalog_index.json"
HTML_FILE = "catalog.html"
UMD_FILE = "ComicReader.umd.js"
PROJECT_ROOT = Path(__file__).parent.resolve()
UMD_SRC = PROJECT_ROOT / UMD_FILE

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PDF Catalog</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='4' fill='%234285f4'/><text x='12' y='17' text-anchor='middle' font-size='14' font-family='sans-serif' fill='white'>P</text></svg>">{% if base_url %}
<meta name="base-url" content="{{ base_url }}">{% endif %}
<style>
*{box-sizing:border-box}
body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;margin:0;padding:0;background:#f5f6f8}

/* ---------- 布局 ---------- */
.layout{display:flex;min-height:100vh}

/* ---------- 侧边栏 ---------- */
.sidebar{width:256px;min-width:256px;background:#fff;border-right:1px solid #e8eaed;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:20;transition:transform .3s,width .3s,min-width .3s}
.sidebar.collapsed{width:0;min-width:0;overflow:hidden;border-right:none}
.sidebar-header{padding:16px 16px 12px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between}
.sidebar-header h1{font-size:17px;font-weight:700;color:#222;margin:0;padding:0;line-height:1.3}
.sidebar-header .count{font-size:12px;color:#999}
.sidebar-collapse-btn{width:28px;height:28px;border:none;border-radius:6px;background:transparent;color:#999;cursor:pointer;font-size:16px;line-height:28px;text-align:center;flex-shrink:0;transition:background .15s}
.sidebar-collapse-btn:hover{background:#f0f1f4;color:#555}
.sidebar-search{padding:0 12px 12px;flex-shrink:0}
.sidebar-search input{width:100%;height:32px;border:1px solid #e0e0e0;border-radius:8px;padding:0 10px;font-size:13px;color:#333;outline:none;background:#f7f8fa}
.sidebar-search input:focus{border-color:#4285f4;background:#fff}
.sidebar-list{flex:1;overflow-y:auto;padding:0 8px 8px;-webkit-overflow-scrolling:touch}
.sidebar-list::-webkit-scrollbar{width:4px}
.sidebar-list::-webkit-scrollbar-thumb{background:#d0d5dd;border-radius:2px}
.sidebar-item{display:block;width:100%;padding:8px 12px;border:none;border-radius:8px;background:transparent;color:#444;font-size:13px;text-align:left;cursor:pointer;line-height:1.4;word-break:break-word;transition:background .1s}
.sidebar-item:hover{background:#f0f1f4}
.sidebar-item.active{background:#e8f0fe;color:#1967d2;font-weight:600}
.sidebar-expand-btn{display:none;position:fixed;top:12px;left:12px;z-index:21;width:36px;height:36px;border:none;border-radius:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1);cursor:pointer;font-size:18px;line-height:36px;text-align:center;transition:opacity .2s}
.sidebar-expand-btn.visible{display:block}

/* ---------- 主内容 ---------- */
.main{padding-left:256px;flex:1;min-width:0;transition:padding-left .3s}
.sidebar.collapsed~.main{padding-left:0}
.toolbar{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:16px 24px;position:sticky;top:0;z-index:10;background:linear-gradient(180deg,#f5f6f8 60%,rgba(245,246,248,0))}
.toolbar select,.toolbar button.danger{height:36px;border-radius:8px;font-size:13px;cursor:pointer}
.toolbar select{padding:0 28px 0 12px;border:1px solid #d0d5dd;background:#fff url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 10px center;color:#333;-webkit-appearance:none;-moz-appearance:none;appearance:none}
.toolbar select:hover{border-color:#999}
.toolbar button.danger{padding:0 14px;border:none;background:transparent;color:#999;line-height:36px}
.toolbar button.danger:hover{color:#ea4335}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;padding:0 24px 40px}
.card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06);transition:transform .2s,box-shadow .2s,.3s outline}
.card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.1)}
.card.highlight{outline:3px solid #4285f4;outline-offset:-3px;border-radius:12px}
.card-cover{background:#eee;aspect-ratio:3/4;overflow:hidden;position:relative;cursor:pointer}
.card-cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
.card:hover .card-cover img{transform:scale(1.06)}
.card-hover{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .25s}
.card:hover .card-hover{opacity:1}
.card-hover-inner{width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.15)}
.card-hover-inner svg{width:22px;height:22px;fill:%234285f4;margin-left:2px}
.card-body{padding:12px}
.card-title{font-size:13px;font-weight:600;color:#222;word-break:break-word;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:4px}
.card-meta{color:#999;font-size:11px;line-height:1.5}

#progress-overlay{position:fixed;inset:0;z-index:99999;display:none;background:rgba(0,0,0,.65);align-items:center;justify-content:center;flex-direction:column}
#progress-overlay.active{display:flex}
#progress-box{background:#fff;border-radius:16px;padding:40px 48px;text-align:center;max-width:400px;width:90%}
#progress-box h3{margin:0 0 12px;font-size:18px;color:#222;font-weight:600}
.progress-bar{height:4px;background:#e8eaed;border-radius:2px;overflow:hidden;margin:16px 0 8px}
.progress-fill{height:100%;width:0%;background:#4285f4;border-radius:2px;transition:width .3s}
#progress-text{font-size:13px;color:#888;margin:0}
#progress-error{color:#ea4335;font-size:13px;margin:8px 0 0;display:none}
#progress-error.show{display:block}
#reader-exit{position:fixed;top:12px;left:12px;z-index:2147483646;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;backdrop-filter:blur(4px);display:none}
#reader-exit:hover{background:rgba(0,0,0,.7)}
#reader-exit.show{display:block}

@media(max-width:768px){
.sidebar{transform:translateX(-100%);position:fixed;z-index:30}
.sidebar.open{transform:translateX(0)}.sidebar.collapsed{transform:translateX(-100%)}
.sidebar-expand-btn.visible{display:block}
.main{padding-left:0!important}
.grid{grid-template-columns:repeat(2,1fr);gap:10px;padding:0 12px 24px}
.toolbar{padding:12px}
}
</style>
</head>
<body>
<div class="layout">

<!-- 侧边栏 -->
<button class="sidebar-expand-btn" onclick="toggleSidebar()" id="sidebarToggle" title="展开目录">☰</button>
<aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
        <div><h1>PDF Catalog</h1><div class="count" id="sidebarCount">{{ items|length }} 本</div></div>
        <button class="sidebar-collapse-btn" onclick="toggleSidebar()" title="收起目录">◀</button>
    </div>
    <div class="sidebar-search">
        <input type="text" placeholder="搜索…" oninput="filterSidebar(this.value)" id="searchInput">
    </div>
    <nav class="sidebar-list" id="sidebarList">
{% for item in items %}
        <button class="sidebar-item" data-index="{{ loop.index0 }}" data-title="{{ item.title|lower }}" onclick="scrollToCard({{ loop.index0 }})">{{ item.title }}</button>
{% endfor %}
    </nav>
</aside>

<!-- 主内容 -->
<div class="main">
    <div class="toolbar">
        <select id="sortSelect" onchange="onSortChange(this.value)">
            <option value="name">按名称排序</option>
            <option value="time">按修改时间排序</option>
        </select>
        <button class="danger" onclick="clearReaderCache()" title="清除阅读器缓存">✕</button>
    </div>
{% if base_url %}
    <div style="text-align:center;padding:0 24px 4px;font-size:12px;color:#999">服务地址: <code>{{ base_url }}</code></div>{% endif %}
    <div class="grid" id="grid">
{% for item in items %}
        <div class="card" id="card-{{ loop.index0 }}" data-index="{{ loop.index0 }}" data-title="{{ item.title|lower }}" data-mtime="{{ item.mtime }}" data-pdf="{{ item.pdf_rel }}">
            <div class="card-cover" onclick="readPdf(this.closest('.card'))">
                <img src="{{ item.image }}" loading="lazy" alt="{{ item.title }}">
                <div class="card-hover"><div class="card-hover-inner"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
            </div>
            <div class="card-body">
                <div class="card-title">{{ item.title }}</div>
                <div class="card-meta">{{ item.size }} · {{ item.mtime_text }}</div>
            </div>
        </div>
{% endfor %}
    </div>
</div>
</div>

<button id="reader-exit" onclick="exitReader()">← 返回目录</button>

<div id="progress-overlay">
    <div id="progress-box">
        <h3 id="progress-title">正在解析 PDF…</h3>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <p id="progress-text">准备中…</p>
        <p id="progress-error"></p>
    </div>
</div>

<script>
var CR=null,PDF=null,C=4;
function gid(id){return document.getElementById(id)}
function loadScript(u){return new Promise(function(ok,no){if(document.querySelector('script[src="'+u+'"]'))return ok();var s=document.createElement('script');s.src=u;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
var lsGet=function(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return localStorage.getItem(k)||d}},lsSet=function(k,v){localStorage.setItem(k,JSON.stringify(v))};

/* ---------- 侧边栏 ---------- */
var SB='@sidebarState';
function toggleSidebar(){var s=gid('sidebar'),e=gid('sidebarToggle'),v=s.classList.toggle('collapsed');e.classList.toggle('visible',v);if(v){s.classList.remove('open')}lsSet(SB,v?'collapsed':'open')}
function highlightCard(i){document.querySelectorAll('.card.highlight').forEach(function(c){c.classList.remove('highlight')});var c=gid('card-'+i);if(c)c.classList.add('highlight')}
function scrollToCard(i){highlightCard(i);var c=gid('card-'+i);if(c){c.scrollIntoView({behavior:'smooth',block:'start'});updateSidebarActive(i);gid('sidebar').classList.remove('open')}}
function filterSidebar(q){var items=document.querySelectorAll('.sidebar-item'),re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');items.forEach(function(b){b.style.display=q?re.test(b.textContent)?'':'none':''})}
function updateSidebarActive(idx){var v=document.querySelector('.sidebar-item.active');if(v)v.classList.remove('active');var n=document.querySelector('.sidebar-item[data-index="'+idx+'"]');if(n){n.classList.add('active');n.scrollIntoView({block:'nearest',behavior:'instant'})}}

/* 初始化侧边栏状态 */
(function(){var v=lsGet(SB,''),w=window.innerWidth;if(w<=768||v==='collapsed'){gid('sidebar').classList.add('collapsed');gid('sidebarToggle').classList.add('visible')}})();

/* ---------- 排序 ---------- */
function onSortChange(v){v==='name'?sortByName():sortByTime();lsSet('@catalogSort',v)}
function sortCards(fn){var g=gid('grid'),cs=Array.from(g.querySelectorAll('.card'));cs.sort(fn);cs.forEach(function(c,i){c.dataset.sortIdx=i;g.appendChild(c)})}
function sortByName(){sortCards(function(a,b){return a.dataset.title.localeCompare(b.dataset.title,void 0,{numeric:true})})}
function sortByTime(){sortCards(function(a,b){return Number(b.dataset.mtime)-Number(a.dataset.mtime)})}
(function(){var s=lsGet('@catalogSort','name');gid('sortSelect').value=s;if(s==='time')sortByTime()})();

/* ---------- 进度 ---------- */
function showProgress(s,t){gid('progress-overlay').classList.toggle('active',s);if(t)gid('progress-text').textContent=t}
function setProgress(p){gid('progress-fill').style.width=Math.round(p*100)+'%';gid('progress-text').textContent=Math.round(p*100)+'%'}
function setProgressError(m){var e=gid('progress-error');e.textContent=m;e.classList.add('show')}
function clearProgressError(){var e=gid('progress-error');e.classList.remove('show');e.textContent=''}

/* ---------- Reader ---------- */
function releaseBlobs(){if(!CR)return;for(var i=0;i<CR.props.imgList.length;i++){var img=CR.props.imgList[i];if(img.src&&img.src.indexOf('blob:')===0)URL.revokeObjectURL(img.src)}}
function exitReader(){if(CR){CR.setProps('show',false);releaseBlobs();CR.setProps('imgList',[])}gid('reader-exit').classList.remove('show');document.title='PDF Catalog'}
function clearReaderCache(){try{localStorage.removeItem('@Option');localStorage.removeItem('@Version');localStorage.removeItem('@Hotkeys')}catch(e){}}
async function ensureCR(){if(window.ComicReadScript)return;await loadScript('{{ umd_path }}')}
async function ensurePDF(){if(PDF)return PDF;var v='5.4.449',cdn='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+v+'/build/pdf.min.mjs';try{PDF=await import(cdn);PDF.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+v+'/build/pdf.worker.min.mjs';return PDF}catch(e){var u='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+v+'/build/pdf.min.js';await loadScript(u);PDF=window.pdfjsLib;PDF.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+v+'/build/pdf.worker.min.js';return PDF}}
async function renderPdf(pdfUrl,title){
    showProgress(true,'正在加载 PDF…');clearProgressError();setProgress(0);
    try{await Promise.all([ensurePDF(),ensureCR()])}catch(e){setProgressError('加载依赖失败: '+e.message);return null}
    var pdf;try{var r=await fetch(pdfUrl);if(!r.ok)throw Error('HTTP '+r.status);pdf=await PDF.getDocument({data:await r.arrayBuffer()}).promise}catch(e){setProgressError('加载 PDF 失败: '+e.message);return null}
    var n=pdf.numPages;gid('progress-title').textContent='正在渲染 '+title+'（共 '+n+' 页）';setProgress(0.05);
    var s=Math.min(window.devicePixelRatio||1,2),pw=document.body.clientWidth,imgs=new Array(n),errs=[];
    var renderOne=async function(i){
        try{var p=await pdf.getPage(i+1),v=p.getViewport({scale:(v=p.view)[2]<pw?pw/v[2]:1}),c=document.createElement('canvas');c.width=Math.floor(v.width*s);c.height=Math.floor(v.height*s);await p.render({canvasContext:c.getContext('2d'),viewport:v,transform:[s,0,0,s,0,0]}).promise;var b=await new Promise(function(r){c.toBlob(r,'image/jpeg',0.92)});imgs[i]={name:''+(i+1),src:URL.createObjectURL(b)}}
        catch(e){errs.push('第'+(i+1)+'页:'+e.message);imgs[i]={name:''+(i+1),src:''}}
    };
    var idx=0,cnt=0,done;var allDone=new Promise(function(r){done=r});
    var worker=async function(){while(true){var i=idx++;if(i>=n)break;await renderOne(i);cnt++;setProgress(0.05+0.94*(cnt/n));if(cnt===n)done()}};
    for(var w=0;w<C;w++)worker();await allDone;
    if(errs.length)setProgressError('部分页面渲染失败:\n'+errs.slice(0,5).join('\n'));
    return imgs.filter(function(x){return x.src});
}
async function readPdf(card){
    var title=card.querySelector('.card-title').textContent.trim(),url=new URL(card.dataset.pdf,location.href).href;
    if(CR)releaseBlobs();var imgs=await renderPdf(url,title);if(!imgs||!imgs.length){if(!gid('progress-error').classList.contains('show'))setProgressError('未能渲染任何页面');showProgress(false);return}
    if(!CR){CR=ComicReadScript.initComicReader({polyfill:{GM:{getValue:lsGet,setValue:lsSet}},props:{option:lsGet('@Option',{}),onOptionChange:function(o){lsSet('@Option',o)},onExit:function(){CR.setProps('show',false);releaseBlobs();gid('reader-exit').classList.remove('show');document.title='PDF Catalog'}}})}
    CR.open(imgs,title);gid('reader-exit').classList.add('show');document.title=title+' - ComicRead';showProgress(false)
}
</script>
</body>
</html>"""

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name)

def load_index(path):
    if not path.exists(): return {}
    try: return json.loads(path.read_text(encoding="utf-8"))
    except: return {}

def save_index(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def human_size(size):
    for u in ["B","KB","MB","GB"]:
        if size < 1024: return f"{size:.1f} {u}"
        size /= 1024
    return f"{size:.1f} TB"

def pdf_changed(pdf_path, index, image_dir):
    info = index.get(pdf_path.name)
    if info is None: return True
    if abs(info["mtime"] - pdf_path.stat().st_mtime) > 1e-6: return True
    return not (image_dir / info.get("image", "")).exists()

def extract_first_page(pdf_path, png_path):
    convert_from_path(pdf_path, first_page=1, last_page=1, dpi=180)[0].save(png_path, "PNG")

def generate_html(pdf_files, index, html_path, base_url):
    items = []
    for pdf in pdf_files:
        if pdf.name not in index: continue
        st = pdf.stat()
        items.append({"title": pdf.stem, "image": f"images/{index[pdf.name]['image']}",
            "pdf": f"../{pdf.name}", "pdf_rel": f"../{pdf.name}",
            "size": human_size(st.st_size), "mtime": st.st_mtime,
            "mtime_text": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")})
    html_path.write_text(Template(HTML_TEMPLATE).render(items=items, umd_path=UMD_FILE, base_url=base_url), encoding="utf-8")

def start_http_server(directory, port):
    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw): super().__init__(*a, directory=str(directory), **kw)
        def log_message(self, f, *a):
            from urllib.parse import unquote
            print(f"  [HTTP] {unquote(f%a)}")
    s = HTTPServer(("0.0.0.0", port), H)
    Thread(target=s.serve_forever, daemon=True).start()
    return s

def process_folder(folder, serve=False, port=8080):
    root = Path(folder).expanduser().resolve()
    if not root.is_dir(): print(f"错误: 文件夹不存在 — {root}"); sys.exit(1)
    out = root / "output"; img_dir = out / "images"
    for d in [out, img_dir]: d.mkdir(exist_ok=True)
    idx_path = out / INDEX_FILE; html_path = out / HTML_FILE
    index = load_index(idx_path)
    pdf_files = sorted(root.glob("*.pdf"))
    if not pdf_files: print(f"未找到 PDF 文件"); sys.exit(0)
    names = {p.name for p in pdf_files}
    removed = 0
    for old in list(index.keys()):
        if old not in names:
            p = img_dir / index[old]["image"]
            if p.exists(): p.unlink()
            del index[old]; removed += 1
    if UMD_SRC.exists() and not (out / UMD_FILE).exists():
        shutil.copy2(str(UMD_SRC), str(out / UMD_FILE))
    updated = 0; skipped = 0
    for pdf in tqdm(pdf_files, desc="处理 PDF"):
        safe = sanitize_filename(pdf.stem); png = img_dir / f"{safe}.png"
        if pdf_changed(pdf, index, img_dir):
            try:
                extract_first_page(pdf, png)
                index[pdf.name] = {"mtime": pdf.stat().st_mtime, "image": f"{safe}.png"}
                updated += 1
            except Exception as e: print(f"  错误 {pdf.name}: {e}")
        else: skipped += 1
    save_index(idx_path, index)
    base_url = f"http://localhost:{port}" if serve else None
    generate_html(pdf_files, index, html_path, base_url)
    img_cnt = sum(1 for _ in img_dir.glob("*.png"))
    print(f"\n  PDF: {len(pdf_files)}, 封面: {img_cnt}, 新增: {updated}", end="")
    if skipped: print(f", 跳过: {skipped}", end="")
    if removed: print(f", 移除: {removed}", end="")
    print(f"\n  HTML: {html_path}")
    if serve:
        print(f"  → http://localhost:{port}/output/{HTML_FILE}")
        webbrowser.open(f"http://localhost:{port}/output/{HTML_FILE}")
        server = start_http_server(root, port)
        try:
            while True: __import__('time').sleep(3600)
        except KeyboardInterrupt: print("\n已停止"); server.shutdown()

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="PDF Catalog — 配合 ComicRead 阅读器在线阅读 PDF")
    p.add_argument("folder", help="PDF 文件夹路径")
    p.add_argument("--serve", "-s", action="store_true", help="启动 HTTP 服务")
    p.add_argument("--port", "-p", type=int, default=8080, help="端口 (默认: 8080)")
    a = p.parse_args()
    process_folder(a.folder, serve=a.serve, port=a.port)

import {
    CONFIG,
    UMD_PATH,
    PDFJS_LOCAL_PATH,
    PDFJS_WORKER_PATH,
    RENDER_CONCURRENCY,
    PAGE_TITLE,
} from "./config.js";
import { gid, lsGet, lsSet, loadScript } from "./utils.js";
import { getActiveJob, setActiveJob } from "./state.js";
import {
    showProgress,
    setProgress,
    setProgressError,
    clearProgressError,
    closeProgress,
} from "./progress.js";
import { markRead } from "./marks.js";

var CR = null;
var PDF = null;

function releaseBlobList(imgs) {
    imgs.forEach(function (img) {
        if (img && img.src && img.src.indexOf("blob:") === 0) {
            URL.revokeObjectURL(img.src);
        }
    });
}

function releaseBlobs() {
    if (!CR) return;
    releaseBlobList(CR.props.imgList);
}

export function ensureReaderInstance() {
    if (CR) return CR;
    CR = ComicReadScript.initComicReader({
        polyfill: { GM: { getValue: lsGet, setValue: lsSet } },
        props: {
            option: lsGet("@Option", {}),
            onOptionChange: function (option) { lsSet("@Option", option); },
            onExit: exitReader,
        },
    });
    return CR;
}

export function exitReader() {
    var job = getActiveJob();
    if (job) {
        job.cancelled = true;
        if (job.abortController) job.abortController.abort();
    }
    closeProgress();
    var overlay = gid("progress-overlay");
    if (overlay) {
        overlay.classList.remove("active", "error");
        overlay.style.display = "none";
    }
    if (CR) {
        CR.setProps("show", false);
        releaseBlobs();
        CR.setProps("imgList", []);
    }
    gid("reader-exit").classList.remove("show");
    document.title = PAGE_TITLE;
}

export function clearReaderCache() {
    try {
        localStorage.removeItem("@Option");
        localStorage.removeItem("@Version");
        localStorage.removeItem("@Hotkeys");
    } catch (err) {
        return;
    }
    var button = gid("clearCacheBtn");
    var text = button.textContent;
    button.textContent = "已重置";
    window.setTimeout(function () { button.textContent = text; }, 1200);
}

export function isReaderVisible() {
    return gid("reader-exit").classList.contains("show");
}

async function ensureComicReader() {
    if (window.ComicReadScript) return;
    await loadScript(UMD_PATH);
}

async function ensurePdfJs() {
    if (PDF) return PDF;
    try {
        var localPdf = new URL(PDFJS_LOCAL_PATH, location.href).href;
        var localWorker = new URL(PDFJS_WORKER_PATH, location.href).href;
        PDF = await import(localPdf);
        PDF.GlobalWorkerOptions.workerSrc = localWorker;
        return PDF;
    } catch (localErr) {
        throw Error("加载本地 pdf.js 失败, 请重新运行 catalog.py 生成缓存");
    }
}

async function renderPdf(pdfUrl, title, pdfPath) {
    var job = { cancelled: false, abortController: new AbortController() };
    setActiveJob(job);
    showProgress(true, "正在加载 PDF...");
    clearProgressError();
    setProgress(0);

    var perfEnabled = Boolean(CONFIG.enablePerf);
    var perf = { start: performance.now() };

    try {
        await Promise.all([ensurePdfJs(), ensureComicReader()]);
    } catch (err) {
        setProgressError("加载依赖失败: " + err.message);
        return null;
    }

    var pdf;
    try {
        if (CONFIG.rangeSupport === true) {
            perf.fetchEnd = performance.now();
            try {
                pdf = await PDF.getDocument({ url: pdfUrl, signal: job.abortController.signal }).promise;
            } catch (rangeErr) {
                console.warn("Range request failed, falling back to full download:", rangeErr);
                var resp = await fetch(pdfUrl, { signal: job.abortController.signal });
                if (!resp.ok) throw Error("HTTP " + resp.status);
                var ab = await resp.arrayBuffer();
                pdf = await PDF.getDocument({ data: ab }).promise;
            }
            perf.parseEnd = performance.now();
        } else {
            var resp = await fetch(pdfUrl, { signal: job.abortController.signal });
            if (!resp.ok) throw Error("HTTP " + resp.status);
            perf.fetchEnd = performance.now();
            var ab = await resp.arrayBuffer();
            perf.arrayBufferEnd = performance.now();
            pdf = await PDF.getDocument({ data: ab }).promise;
            perf.parseEnd = performance.now();
        }
    } catch (err) {
        if (!job.cancelled) setProgressError("加载 PDF 失败: " + err.message);
        return null;
    }

    if (job.cancelled) return null;

    var pageCount = pdf.numPages;
    gid("progress-title").textContent = "正在渲染 " + title + "（共 " + pageCount + " 页）";
    setProgress(0.05);

    var pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.pixelRatio || 2);
    var pageWidth = document.body.clientWidth;
    var imgs = new Array(pageCount);
    var renderedImgs = [];
    var errors = [];
    var index = 0;
    var completed = 0;
    var INITIAL_COUNT = Math.max(1, Math.min(pageCount, CONFIG.initialRenderPages || 3));
    var openedReader = false;
    var lastUpdatedCount = 0;

    async function renderOne(pageIndex) {
        try {
            var t0 = perfEnabled ? performance.now() : 0;
            var page = await pdf.getPage(pageIndex + 1);
            var view = page.view;
            var scale = view[2] < pageWidth ? pageWidth / view[2] : 1;
            var viewport = page.getViewport({ scale: scale });
            var canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width * pixelRatio);
            canvas.height = Math.floor(viewport.height * pixelRatio);
            await page.render({
                canvasContext: canvas.getContext("2d"),
                viewport: viewport,
                transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
            }).promise;
            var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", 0.92); });
            canvas.width = 0;
            canvas.height = 0;
            if (!blob) throw Error("空白渲染结果");
            imgs[pageIndex] = { name: String(pageIndex + 1), src: URL.createObjectURL(blob) };
            renderedImgs.push(imgs[pageIndex]);
            if (perfEnabled) perf["page_" + (pageIndex + 1)] = performance.now() - t0;
        } catch (err) {
            errors.push("第" + (pageIndex + 1) + "页: " + err.message);
            imgs[pageIndex] = { name: String(pageIndex + 1), src: "" };
        }
    }

    async function worker() {
        while (!job.cancelled) {
            var pageIndex = index++;
            if (pageIndex >= pageCount) break;
            await renderOne(pageIndex);
            if (job.cancelled) break;
            completed += 1;
            setProgress(0.05 + 0.94 * (completed / pageCount));

            if (!openedReader && completed >= INITIAL_COUNT) {
                openedReader = true;
                var initialImgs = imgs.slice(0, INITIAL_COUNT).filter(function (i) { return i && i.src; });
                if (initialImgs.length) {
                    ensureReaderInstance();
                    CR.open(initialImgs, title);
                    if (pdfPath) markRead(pdfPath);
                    gid("reader-exit").classList.add("show");
                    document.title = title + " - ComicRead";
                    closeProgress();
                }
            }

            if (openedReader && CR) {
                try {
                    if (renderedImgs.length > lastUpdatedCount) {
                        lastUpdatedCount = renderedImgs.length;
                        CR.setProps("imgList", renderedImgs);
                    }
                } catch (e) {}
            }
        }
    }

    var workers = [];
    for (var i = 0; i < Math.min(RENDER_CONCURRENCY, pageCount); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    if (job.cancelled) {
        releaseBlobList(imgs);
        setActiveJob(null);
        return null;
    }
    if (errors.length) {
        setProgressError("部分页面渲染失败:\n" + errors.slice(0, 5).join("\n"));
    }

    setActiveJob(null);

    if (perfEnabled) {
        perf.end = performance.now();
        var fetchMs = Math.round((perf.arrayBufferEnd || perf.fetchEnd) - perf.start);
        var parseMs = Math.round((perf.parseEnd || perf.arrayBufferEnd) - (perf.arrayBufferEnd || perf.fetchEnd));
        var renderMs = Math.round(perf.end - (perf.parseEnd || perf.start));
        var avgPage = Math.round(renderMs / Math.max(1, pageCount));
        console.debug("perf: fetch=%dms parse=%dms render=%dms avgPage=%dms", fetchMs, parseMs, renderMs, avgPage);
    }

    return imgs.filter(function (img) { return img.src; });
}

export async function readPdf(card) {
    var title = card.querySelector(".card-title").textContent.trim();
    var url = new URL(card.dataset.pdf, location.href).href;

    var prevJob = getActiveJob();
    if (prevJob) {
        prevJob.cancelled = true;
        if (prevJob.abortController) prevJob.abortController.abort();
    }

    card.classList.add("loading");
    try {
        if (CR) releaseBlobs();
        var imgs = await renderPdf(url, title, card.dataset.pdf);
        if (!imgs || !imgs.length) {
            if (!gid("progress-error").classList.contains("show") && getActiveJob() && !getActiveJob().cancelled) {
                setProgressError("未能渲染任何页面");
            }
            return;
        }
        if (gid("reader-exit").classList.contains("show")) return;
        ensureReaderInstance();
        CR.open(imgs, title);
        markRead(card.dataset.pdf);
        gid("reader-exit").classList.add("show");
        document.title = title + " - ComicRead";
        closeProgress();
    } finally {
        card.classList.remove("loading");
    }
}

/**
 * PDF阅读器模块
 * 负责PDF的加载、渲染、ComicReader集成
 */
var PdfReader = (function () {
    "use strict";

    var CR = null;
    var PDF = null;
    var activeJob = null;

    var UMD_PATH = CatalogConfig.umdPath || "vendor/ComicReader.umd.js";
    var PDFJS_LOCAL_PATH = CatalogConfig.pdfjsLocalPath || "vendor/pdfjs/pdf.min.mjs";
    var PDFJS_WORKER_PATH = CatalogConfig.pdfjsWorkerPath || "vendor/pdfjs/pdf.worker.min.mjs";
    var RENDER_CONCURRENCY = CatalogConfig.renderConcurrency || 2;
    var PAGE_TITLE = CatalogConfig.title || "Nocturne Manga";

    function releaseBlobs() {
        if (CR && CR.imgs) {
            Utils.releaseBlobList(CR.imgs);
        }
    }

    function exitReader() {
        if (activeJob) {
            activeJob.cancelled = true;
        }
        Progress.closeProgress();
        var comic = Utils.gid("comic");
        if (comic) {
            comic.innerHTML = "";
        }
        releaseBlobs();
        CR = null;
        document.title = PAGE_TITLE;
    }

    function isReaderVisible() {
        var comic = Utils.gid("comic");
        return comic && comic.style.display !== "none";
    }

    function clearReaderCache() {
        releaseBlobs();
        CR = null;
        var comic = Utils.gid("comic");
        if (comic) {
            comic.innerHTML = "";
        }
        Progress.setProgressError("阅读器缓存已清除", "操作成功");
    }

    async function ensureComicReader() {
        if (typeof ComicReadScript !== "undefined") {
            return;
        }
        await Utils.loadScript(UMD_PATH);
    }

    async function ensurePdfJs() {
        if (PDF) {
            return PDF;
        }
        PDF = await import(PDFJS_LOCAL_PATH);
        PDF.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
        return PDF;
    }

    async function renderPdf(pdfUrl, title) {
        var job = { cancelled: false };
        activeJob = job;
        Progress.showProgress(true, "正在解析 PDF...");
        Progress.setProgress(0);
        Progress.clearProgressError();
        try {
            await ensureComicReader();
            await ensurePdfJs();
            var pdf = await PDF.getDocument(pdfUrl).promise;
            var totalPages = pdf.numPages;
            Progress.setProgress(5);

            var filled = new Array(totalPages);
            var rendered = 0;
            var nextIndex = 0;

            async function renderOne(pageIndex) {
                if (job.cancelled) return;
                var page = await pdf.getPage(pageIndex + 1);
                var viewport = page.getViewport({ scale: CatalogConfig.pixelRatio || 2 });
                var canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                var ctx = canvas.getContext("2d");
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                filled[pageIndex] = canvas.toDataURL("image/jpeg", 0.92);
                rendered++;
                Progress.setProgress(5 + (rendered / totalPages) * 90);
            }

            async function worker() {
                while (nextIndex < totalPages) {
                    if (job.cancelled) return;
                    var idx = nextIndex++;
                    await renderOne(idx);
                }
            }

            var workers = [];
            for (var i = 0; i < Math.min(RENDER_CONCURRENCY, totalPages); i++) {
                workers.push(worker());
            }
            await Promise.all(workers);

            if (job.cancelled) return;

            var imgs = filled.map(function (dataUrl, idx) {
                return { src: dataUrl, index: idx };
            });

            Progress.setProgress(95);

            CR = await ComicReadScript.create({
                name: title,
                imgs: imgs,
                option: { rememberLastReading: true },
            });

            Progress.setProgress(100);
            Progress.closeProgress();
            document.title = title + " - " + PAGE_TITLE;
        } catch (err) {
            if (!job.cancelled) {
                Progress.setProgressError("渲染 PDF 失败: " + err.message);
            }
        }
    }

    async function readPdf(card) {
        if (activeJob) {
            activeJob.cancelled = true;
        }
        releaseBlobs();
        var pdfUrl = card.dataset.pdf;
        var title = card.dataset.title || "PDF";
        if (!pdfUrl) {
            Progress.setProgressError("无法获取 PDF 地址");
            return;
        }
        try {
            await ensureComicReader();
            await ensurePdfJs();
            var loadingTask = PDF.getDocument(pdfUrl);
            var pdfDoc = await loadingTask.promise;
            var pages = pdfDoc.numPages;
            var filled = new Array(pages);
            var renderedCount = 0;
            var nextIdx = 0;
            var job = { cancelled: false };
            activeJob = job;

            Progress.showProgress(true, "正在渲染 PDF...");
            Progress.setProgress(0);

            async function renderPage(pageNum) {
                if (job.cancelled) return;
                var page = await pdfDoc.getPage(pageNum);
                var scale = Utils.lsGet("@readerScale", 1.5);
                var viewport = page.getViewport({ scale: scale });
                var canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                var ctx = canvas.getContext("2d");
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                filled[pageNum - 1] = canvas.toDataURL("image/jpeg", 0.92);
                renderedCount++;
                Progress.setProgress((renderedCount / pages) * 90);
            }

            async function worker() {
                while (nextIdx < pages) {
                    if (job.cancelled) return;
                    var idx = nextIdx++;
                    await renderPage(idx + 1);
                }
            }

            var workers = [];
            for (var i = 0; i < Math.min(RENDER_CONCURRENCY, pages); i++) {
                workers.push(worker());
            }
            await Promise.all(workers);

            if (job.cancelled) return;

            var imgs = filled.map(function (src, idx) {
                return { src: src, index: idx };
            });

            Progress.setProgress(95);

            CR = await ComicReadScript.create({
                name: title,
                imgs: imgs,
                option: { rememberLastReading: true },
            });

            Progress.setProgress(100);
            Progress.closeProgress();
            document.title = title + " - " + PAGE_TITLE;
        } catch (err) {
            Progress.setProgressError("渲染 PDF 失败: " + err.message);
        }
    }

    function getActiveJob() {
        return activeJob;
    }

    function setActiveJob(job) {
        activeJob = job;
    }

    return {
        releaseBlobs: releaseBlobs,
        exitReader: exitReader,
        isReaderVisible: isReaderVisible,
        clearReaderCache: clearReaderCache,
        ensureComicReader: ensureComicReader,
        ensurePdfJs: ensurePdfJs,
        renderPdf: renderPdf,
        readPdf: readPdf,
        getActiveJob: getActiveJob,
        setActiveJob: setActiveJob,
    };
})();

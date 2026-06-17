import {
    CONFIG,
    TREE,
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

// ---- Nocturne theme bridge into ComicReader's Shadow DOM ----
// The reader mounts into a closed Shadow DOM (helper.mountComponents uses
// attachShadow({ mode: "closed" })), so the catalog's stylesheet cannot reach
// it. We one-shot monkey-patch Element.prototype.attachShadow to capture the
// ShadowRoot and inject a CSSStyleSheet that re-exports the catalog's CSS
// variables plus a PDF-friendly background.
var _shadowRootRef = null;
var _attachShadowPatched = false;
var _themeSyncInProgress = false;

function injectNocturneThemeIntoShadow() {
    var css = [
        ":host {",
        "  font-family: \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif;",
        "  color-scheme: light dark;",
        "  background: var(--nocturne-reader-bg, #eef2f6);",
        "}",
        // Complete variable mapping: the UMD references many more variable names
        // than were previously covered. Missing mappings caused toolbar / settings
        // panel backgrounds to fall back to hardcoded dark-mode values (#121212).
        ":host {",
        "  --bg: var(--nocturne-reader-bg, #eef2f6);",
        "  --page-bg: var(--nocturne-reader-panel, #ffffff);",
        "  --text: var(--nocturne-reader-text, #20242a);",
        "  --text-bg: var(--nocturne-reader-panel, #ffffff);",
        "  --text-secondary: var(--nocturne-reader-muted, #687180);",
        "  --secondary: var(--nocturne-reader-muted, #687180);",
        "  --secondary-bg: var(--nocturne-reader-panel, #ffffff);",
        "  --hover-bg-color: var(--nocturne-reader-accent, #2f6fec)22;",
        "  --hover-bg-color-enable: var(--nocturne-reader-accent, #2f6fec)44;",
        "  --switch: var(--nocturne-reader-accent, #2f6fec);",
        "  --switch-bg: var(--nocturne-reader-border, #dce3ea);",
        "  --scrollbar-slider: var(--nocturne-reader-border, #dce3ea);",
        "}",
        // Override hardcoded colors the UMD bakes directly into CSS rules,
        // bypassing var(--*) entirely. Attribute selectors match the hashed
        // CSS-module class names (e.g. .endPage____hash_base64_5_).
        "[class*='endPage_'] {",
        "  background-color: var(--nocturne-reader-bg, #eef2f6) !important;",
        "  color: var(--nocturne-reader-text, #20242a) !important;",
        "}",
        "[class*='endPage_'] button {",
        "  color: var(--nocturne-reader-text, #20242a) !important;",
        "}",
        "[class*='scrollbarPoper_'] {",
        "  background-color: var(--nocturne-reader-panel, #ffffff) !important;",
        "  color: var(--nocturne-reader-text, #20242a) !important;",
        "}",
        "[class*='scrollbar_']:before {",
        "  border-left-color: var(--nocturne-reader-panel, #ffffff) !important;",
        "}",
        "[class*='scrollbarSlider_'] {",
        "  background-color: var(--nocturne-reader-border, #dce3ea)99 !important;",
        "}",
        "[class*='iconButtonPopper_'] {",
        "  background-color: var(--nocturne-reader-panel, #ffffff) !important;",
        "  color: var(--nocturne-reader-text, #20242a) !important;",
        "}",
        "[class*='SettingPanel_'] hr {",
        "  color: var(--nocturne-reader-border, #dce3ea) !important;",
        "}",
        "[class*='toolbarBg_'] {",
        "  background-color: var(--nocturne-reader-panel, #ffffff) !important;",
        "}",
    ].join("\n");
    try {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        var root = _shadowRootRef;
        if (root && root.adoptedStyleSheets !== undefined) {
            root.adoptedStyleSheets = [sheet].concat(
                Array.from(root.adoptedStyleSheets),
            );
        }
    } catch (err) {
        console.warn("Nocturne theme injection failed:", err);
    }
}

function installShadowPatch() {
    if (_attachShadowPatched) return;
    _attachShadowPatched = true;
    var original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
        var sr = original.call(this, init);
        try {
            _shadowRootRef = sr;
            injectNocturneThemeIntoShadow();
        } finally {
            Element.prototype.attachShadow = original;
            _attachShadowPatched = false;
        }
        return sr;
    };
}

// PDF-friendly defaults. These are merged as the reader's "defaultOption",
// so users can still override each of them via the reader's own settings
// panel; overrides persist through the onOptionChange → lsSet("@Option") path.
//
// Side benefit: the reader's toolbar buttons have a hidden() predicate that
// checks the corresponding option toggle, so disabling translation /
// autoScroll / imgRecognition here also hides their buttons — a safer
// alternative to fragile text-based filtering of the button list.
var PDF_DEFAULT_OPTION = {
    darkMode: false, // seeded at init time from catalog state
    autoDarkMode: false, // we manage catalog↔reader sync ourselves
    autoFullscreen: false,
    autoHiddenMouse: true,
    firstPageFill: true,
    pageNum: 2, // double-page default
    autoSwitchPageMode: true, // auto-fallback to single on narrow viewports
    dir: "ltr",
    preloadPageNum: 3,
    scrollMode: { enabled: false, imgScale: 1, spacing: 8 },
    imgRecognition: { enabled: false },
    translation: { enabled: false },
    autoScroll: { enabled: false },
    clickPageTurn: { enabled: true, area: "left_right" },
    scroolEnd: "auto",
    scrollbar: { position: "auto", autoHidden: true, showImgStatus: true },
};

function currentCatalogIsDark() {
    return document.documentElement.classList.contains("dark-theme");
}

function pushDarkModeToReader(isDark) {
    if (!CR || !CR.setState) return;
    try {
        CR.setState(function (state) {
            state.option.darkMode = isDark;
        });
    } catch (err) {
        console.warn("Failed to push darkMode to reader:", err);
    }
}

function syncDarkModeFromReader(nextOption) {
    if (_themeSyncInProgress) return;
    if (!nextOption || typeof nextOption.darkMode !== "boolean") return;
    var desired = nextOption.darkMode;
    if (currentCatalogIsDark() === desired) return;
    _themeSyncInProgress = true;
    try {
        if (desired) {
            document.documentElement.classList.add("dark-theme");
        } else {
            document.documentElement.classList.remove("dark-theme");
        }
        lsSet("@theme", desired ? "dark" : "light");
        var icon = gid("themeIcon");
        var toggle = gid("themeToggle");
        if (icon) icon.textContent = desired ? "🌙" : "☀️";
        if (toggle) {
            toggle.setAttribute("aria-checked", desired ? "true" : "false");
            toggle.title = desired ? "切换到日间模式" : "切换到夜间模式";
        }
        document.dispatchEvent(
            new CustomEvent("nocturne:theme-change", { detail: { isDark: desired } }),
        );
    } finally {
        window.setTimeout(function () { _themeSyncInProgress = false; }, 0);
    }
}

function bindCatalogThemeSync() {
    document.addEventListener("nocturne:theme-change", function (e) {
        if (_themeSyncInProgress) return;
        var isDark = Boolean(e.detail && e.detail.isDark);
        _themeSyncInProgress = true;
        try {
            pushDarkModeToReader(isDark);
        } finally {
            window.setTimeout(function () { _themeSyncInProgress = false; }, 0);
        }
    });
}

// ---- Cross-PDF navigation ----
// Build a prev/next map from the catalog tree. PDFs within the same folder
// (including nested subfolders) are linked sequentially so the reader can
// jump between sibling volumes without returning to the catalog.
var navMap = null;
var currentPdfUrl = null;

function buildNavMap() {
    if (navMap) return navMap;
    navMap = {};
    function toUrl(relPath) {
        var quoted = "../" + relPath.split("/").map(encodeURIComponent).join("/");
        return new URL(quoted, location.href).href;
    }
    function walk(node) {
        if (!node || !node.children) return;
        var directPdfs = [];
        for (var i = 0; i < node.children.length; i++) {
            var child = node.children[i];
            if (child.type === "pdf") {
                var relPath = child.folder
                    ? child.folder + "/" + child.name
                    : child.name;
                directPdfs.push(relPath);
            } else if (child.type === "dir") {
                walk(child);
            }
        }
        for (var j = 0; j < directPdfs.length; j++) {
            var href = toUrl(directPdfs[j]);
            var prev = j > 0 ? toUrl(directPdfs[j - 1]) : null;
            var next = j < directPdfs.length - 1 ? toUrl(directPdfs[j + 1]) : null;
            navMap[href] = { prev: prev, next: next };
        }
    }
    var roots = Array.isArray(TREE) ? TREE : [TREE];
    for (var i = 0; i < roots.length; i++) walk(roots[i]);
    return navMap;
}

async function navigateToPdf(pdfUrl, title) {
    var prevJob = getActiveJob();
    if (prevJob) {
        prevJob.cancelled = true;
        if (prevJob.abortController) prevJob.abortController.abort();
    }
    currentPdfUrl = pdfUrl;
    if (CR) releaseBlobs();
    showProgress(true, "正在加载 " + title + "...");
    var imgs = await renderPdf(pdfUrl, title);
    if (!imgs || !imgs.length) {
        if (!gid("progress-error").classList.contains("show") && getActiveJob() && !getActiveJob().cancelled) {
            setProgressError("未能渲染任何页面");
        }
        return;
    }
    if (!gid("reader-exit").classList.contains("show")) {
        ensureReaderInstance();
        CR.open(imgs, title);
        gid("reader-exit").classList.add("show");
    }
    document.title = title + " - ComicRead";
    closeProgress();
}

function ensureReaderInstance() {
    if (CR) return CR;
    installShadowPatch();
    var savedOption = lsGet("@Option", {}) || {};
    // Discard any persisted darkMode/autoDarkMode: the reader must always
    // follow the catalog's current theme (which itself is persisted via
    // @theme). Keeping stale values would cause the reader to fight the
    // catalog on init and force a theme flip via onOptionChange.
    delete savedOption.darkMode;
    delete savedOption.autoDarkMode;
    var initialDark = currentCatalogIsDark();
    CR = ComicReadScript.initComicReader({
        polyfill: { GM: { getValue: lsGet, setValue: lsSet } },
        props: {
            option: Object.assign({}, savedOption, { darkMode: initialDark }),
            defaultOption: Object.assign({}, PDF_DEFAULT_OPTION, {
                darkMode: initialDark,
            }),
            onOptionChange: function (option) {
                syncDarkModeFromReader(option);
                var toSave = Object.assign({}, option);
                delete toSave.darkMode;
                delete toSave.autoDarkMode;
                lsSet("@Option", toSave);
            },
            onExit: exitReader,
            onPrev: function () {
                var map = buildNavMap();
                var nav = map[currentPdfUrl];
                if (nav && nav.prev) {
                    var name = decodeURIComponent(nav.prev.split("/").pop());
                    navigateToPdf(nav.prev, name.replace(/\.pdf$/i, ""));
                }
            },
            onNext: function () {
                var map = buildNavMap();
                var nav = map[currentPdfUrl];
                if (nav && nav.next) {
                    var name = decodeURIComponent(nav.next.split("/").pop());
                    navigateToPdf(nav.next, name.replace(/\.pdf$/i, ""));
                }
            },
            editSettingList: function (list) {
                var hidden = ["翻译", "图像识别", "自动滚动"];
                return list.filter(function (item) {
                    var name = String(item[0] || "");
                    return !hidden.some(function (h) { return name.indexOf(h) === 0; });
                });
            },
        },
    });
    bindCatalogThemeSync();
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

async function renderPdf(pdfUrl, title) {
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
    var finished = new Array(pageCount);
    var errors = [];
    var INITIAL_COUNT = Math.max(1, Math.min(pageCount, CONFIG.initialRenderPages || 3));
    var pageQueue = [];
    for (var qi = 0; qi < INITIAL_COUNT; qi++) pageQueue.push(qi);
    var index = INITIAL_COUNT;
    var completed = 0;
    var openedReader = false;
    var lastPublishedCount = 0;
    var publishRaf = 0;
    var maxRenderWidth = CONFIG.maxRenderWidth || 1800;
    var jpegQuality = Math.max(0.5, Math.min(0.95, CONFIG.jpegQuality || 0.88));

    function getPublishableImages() {
        var list = [];
        for (var i = 0; i < imgs.length; i += 1) {
            if (!finished[i]) break;
            if (imgs[i] && imgs[i].src) list.push(imgs[i]);
        }
        return list;
    }

    function schedulePublish() {
        if (publishRaf) return;
        publishRaf = requestAnimationFrame(function () {
            publishRaf = 0;
            if (!openedReader || !CR) return;
            try {
                var publishable = getPublishableImages();
                if (publishable.length > lastPublishedCount) {
                    lastPublishedCount = publishable.length;
                    CR.setProps("imgList", publishable);
                }
            } catch (e) {}
        });
    }

    async function renderOne(pageIndex) {
        try {
            var t0 = perfEnabled ? performance.now() : 0;
            var page = await pdf.getPage(pageIndex + 1);
            var view = page.view;
            var targetWidth = Math.min(pageWidth, maxRenderWidth);
            var scale = targetWidth / view[2];
            var viewport = page.getViewport({ scale: scale });
            var canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width * pixelRatio);
            canvas.height = Math.floor(viewport.height * pixelRatio);
            await page.render({
                canvasContext: canvas.getContext("2d"),
                viewport: viewport,
                transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
            }).promise;
            var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", jpegQuality); });
            canvas.width = 0;
            canvas.height = 0;
            if (!blob) throw Error("空白渲染结果");
            imgs[pageIndex] = { name: String(pageIndex + 1), src: URL.createObjectURL(blob) };
            if (perfEnabled) perf["page_" + (pageIndex + 1)] = performance.now() - t0;
        } catch (err) {
            errors.push("第" + (pageIndex + 1) + "页: " + err.message);
            imgs[pageIndex] = { name: String(pageIndex + 1), src: "" };
        } finally {
            finished[pageIndex] = true;
        }
    }

    async function worker() {
        while (!job.cancelled) {
            var pageIndex = pageQueue.length > 0 ? pageQueue.shift() : index++;
            if (pageIndex >= pageCount) break;
            await renderOne(pageIndex);
            if (job.cancelled) break;
            completed += 1;
            setProgress(0.05 + 0.94 * (completed / pageCount));

            if (!openedReader && completed >= INITIAL_COUNT) {
                var initialImgs = getPublishableImages();
                if (initialImgs.length >= INITIAL_COUNT) {
                    openedReader = true;
                    lastPublishedCount = initialImgs.length;
                    ensureReaderInstance();
                    CR.open(initialImgs, title);
                    gid("reader-exit").classList.add("show");
                    document.title = title + " - ComicRead";
                    closeProgress();
                }
            }

            if (openedReader && CR) {
                schedulePublish();
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

    return imgs.filter(function (img) { return img && img.src; });
}

export async function readPdf(card) {
    var title = card.querySelector(".card-title").textContent.trim();
    var url = new URL(card.dataset.pdf, location.href).href;

    var prevJob = getActiveJob();
    if (prevJob) {
        prevJob.cancelled = true;
        if (prevJob.abortController) prevJob.abortController.abort();
    }

    currentPdfUrl = url;
    card.classList.add("loading");
    try {
        if (CR) releaseBlobs();
        var imgs = await renderPdf(url, title);
        if (!imgs || !imgs.length) {
            if (!gid("progress-error").classList.contains("show") && getActiveJob() && !getActiveJob().cancelled) {
                setProgressError("未能渲染任何页面");
            }
            return;
        }
        if (gid("reader-exit").classList.contains("show")) return;
        ensureReaderInstance();
        CR.open(imgs, title);
        gid("reader-exit").classList.add("show");
        document.title = title + " - ComicRead";
        closeProgress();
    } finally {
        card.classList.remove("loading");
    }
}

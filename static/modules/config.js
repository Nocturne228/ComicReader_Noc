var raw = window.CATALOG_CONFIG || {};

export var CONFIG = raw;
export var TREE = raw.tree || [];
export var UMD_PATH = raw.umdPath || "vendor/ComicReader.umd.js";
export var PDFJS_LOCAL_PATH = raw.pdfjsLocalPath || "vendor/pdfjs/pdf.min.mjs";
export var PDFJS_WORKER_PATH =
    raw.pdfjsWorkerPath || "vendor/pdfjs/pdf.worker.min.mjs";
export var RENDER_CONCURRENCY = raw.renderConcurrency || 2;
export var PAGE_TITLE = raw.title || "Nocturne Manga";

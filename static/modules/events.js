import { CONFIG, TREE } from "./config.js";
import { gid, bindClick, isMobile, lsGet, lsSet } from "./utils.js";
import { getViewMode, setViewMode } from "./state.js";
import { toggleSidebar, setSidebar } from "./sidebar.js";
import { syncSidebarFolder, updateAllCollapsedFromHeaders } from "./sidebar.js";
import { setNodeExpandedRecursive, toggleFoldAll } from "./tree.js";
import { filterTree } from "./search.js";
import { sortByName, sortByTime, onSortChange } from "./sort.js";
import { closeProgress, cancelProgress } from "./progress.js";
import { readPdf, exitReader, clearReaderCache } from "./reader.js";
import {
    shutdownServer,
    refreshCatalog,
    openNativePdf,
} from "./server-control.js";
import {
    closeRestartDialog,
    handleRestartConfirm,
} from "./dialogs.js";
import { initDropdowns } from "./dropdown.js";
import { toggleShortcutHelp } from "./shortcuts.js";
import { toggleTheme } from "./theme.js";

function updateViewModeBtn() {
    var btn = gid("toggleViewModeBtn");
    if (!btn) return;
    var mode = getViewMode();
    if (!CONFIG.nativeOpenEnabled) {
        setViewMode("reader");
        btn.disabled = true;
        btn.textContent = "网页阅读";
        btn.title = "Preview 打开需要通过 --serve 启动本地服务";
        btn.classList.remove("active");
        return;
    }
    btn.textContent = mode === "native" ? "Preview" : "网页阅读";
    btn.title = mode === "native"
        ? "点击卡片时使用 macOS Preview 打开 PDF"
        : "点击卡片时使用内置网页阅读器";
    btn.classList.toggle("active", mode === "native");
}

export function toggleViewMode() {
    if (!CONFIG.nativeOpenEnabled) return;
    var mode = getViewMode();
    var newMode = mode === "reader" ? "native" : "reader";
    setViewMode(newMode);
    lsSet("@viewMode", newMode);
    updateViewModeBtn();
}

function initState() {
    var saved = lsGet("@sidebarState", "");
    if (isMobile() || saved === "collapsed") {
        setSidebar(false);
    }
    var sort = lsGet("@catalogSort", "name");
    if (sort !== "time") sort = "name";
    gid("sortSelect").value = sort;
    if (sort === "name") {
        sortByName();
    } else {
        sortByTime();
    }
    setNodeExpandedRecursive(TREE, false);
    updateAllCollapsedFromHeaders();
}

export function bindEvents() {
    bindClick("sidebarToggle", toggleSidebar);
    bindClick("sidebarCollapse", toggleSidebar);

    var searchInput = gid("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", function (event) {
            filterTree(event.target.value);
        });
        searchInput.addEventListener("keydown", function (event) {
            if (event.key === "Escape") this.blur();
        });
    }

    var sortSelect = gid("sortSelect");
    if (sortSelect) {
        sortSelect.addEventListener("change", function (event) {
            onSortChange(event.target.value);
        });
    }

    bindClick("toggleFoldBtn", toggleFoldAll);
    bindClick("toggleViewModeBtn", toggleViewMode);
    bindClick("refreshCatalogBtn", refreshCatalog);

    bindClick("openRootBtn", function () {
        fetch(CONFIG.openRootPath || "/__open_root", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-ComicReader-Token": CONFIG.shutdownToken || "",
            },
        });
    });

    bindClick("clearCacheBtn", clearReaderCache);
    bindClick("shutdownServerBtn", shutdownServer);
    bindClick("restartServerBtn", function () {
        gid("restartDialog").style.display = "flex";
    });

    bindClick("restartCancel", closeRestartDialog);
    bindClick("restartDialogBackdrop", closeRestartDialog);
    bindClick("restartConfirm", handleRestartConfirm);

    initDropdowns();

    bindClick("progressMinimize", function () {
        var overlay = gid("progress-overlay");
        if (overlay) {
            overlay.classList.toggle("minimized");
            var btn = gid("progressMinimize");
            if (btn) {
                btn.textContent = overlay.classList.contains("minimized") ? "□" : "─";
                btn.title = overlay.classList.contains("minimized") ? "恢复" : "最小化";
            }
        }
    });

    bindClick("themeToggle", toggleTheme);
    bindClick("shortcutHelpBtn", toggleShortcutHelp);
    bindClick("reader-exit", exitReader);
    bindClick("progressCancel", cancelProgress);
    bindClick("progressClose", closeProgress);

    bindClick("shortcutHelpClose", function () {
        gid("shortcutHelp").style.display = "none";
    });
    var helpPage = document.querySelector("#shortcutHelp .shortcut-help-page");
    if (helpPage) {
        helpPage.addEventListener("click", function (event) {
            if (!event.target.closest(".shortcut-help-card")) {
                gid("shortcutHelp").style.display = "none";
            }
        });
    }

    document.querySelectorAll(".folder-header").forEach(function (header) {
        header.addEventListener("click", function () {
            header.classList.toggle("collapsed");
            syncSidebarFolder(
                header.dataset.folder || "",
                !header.classList.contains("collapsed"),
            );
            updateAllCollapsedFromHeaders();
        });
    });

    document.querySelectorAll(".card-cover").forEach(function (cover) {
        cover.addEventListener("click", function () {
            var card = cover.closest(".card");
            if (getViewMode() === "native") {
                openNativePdf(card);
            } else {
                readPdf(card);
            }
        });
    });

    initState();
    updateViewModeBtn();
}

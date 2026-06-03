/**
 * 启动模块
 * 负责初始化所有模块、绑定事件、启动应用
 */
var Bootstrap = (function () {
    "use strict";

    function bindEvents() {
        Utils.bindClick("sidebarToggle", function () {
            Sidebar.toggleSidebar();
        });
        Utils.bindClick("sidebarCollapse", function () {
            Sidebar.setSidebar(false);
        });

        var searchInput = Utils.gid("searchInput");
        if (searchInput) {
            searchInput.addEventListener("input", function () {
                TreeNav.filterTree(searchInput.value);
            });
        }

        Utils.bindClick("sortSelect", function () {
            Sort.onSortChange(this.value);
        });
        Utils.bindClick("toggleFoldBtn", TreeNav.toggleFoldAll);
        Utils.bindClick("toggleViewModeBtn", ViewMode.toggleViewMode);
        Utils.bindClick("refreshCatalogBtn", ServerControl.refreshCatalog);

        Utils.bindClick("openFolderBtn", async function () {
            var btn = this;
            btn.disabled = true;
            await ServerControl.openToolFolder("", btn);
            btn.disabled = false;
        });

        Utils.bindClick("clearCacheBtn", PdfReader.clearReaderCache);
        Utils.bindClick("shutdownServerBtn", ServerControl.shutdownServer);
        Utils.bindClick("restartServerBtn", function () {
            Utils.gid("restartDialog").style.display = "flex";
        });

        // 重启确认对话框逻辑
        Utils.bindClick("restartCancel", Restart.closeRestartDialog);
        Utils.bindClick("restartDialogBackdrop", Restart.closeRestartDialog);
        Utils.bindClick("restartConfirm", Restart.confirmRestart);

        Utils.bindClick("themeToggle", Theme.toggleTheme);
        Utils.bindClick("shortcutHelpBtn", ServerControl.toggleShortcutHelp);
        Utils.bindClick("shortcutHelpClose", function () {
            ServerControl.setShortcutHelp(false);
        });

        var helpPage = document.querySelector("#shortcutHelp .shortcut-help-page");
        if (helpPage) {
            helpPage.addEventListener("click", function (event) {
                if (!event.target.closest(".shortcut-help-card"))
                    ServerControl.setShortcutHelp(false);
            });
        }

        Utils.bindClick("toolDialogCancel", Tools.closeToolDialog);
        Utils.bindClick("toolDialogRun", Tools.runTool);
        Utils.bindClick("toolDialogOpen", function () {
            var path = ServerControl.getToolOpenPath();
            ServerControl.openToolFolder(path, this);
        });

        Utils.bindClick("toolDialogClean", async function () {
            var btn = this;
            btn.disabled = true;
            try {
                await ServerControl.postControlJson("/__tool_clean", {
                    tool: Tools.activeTool,
                });
            } catch (err) {
                Progress.setProgressError("清理失败: " + err.message);
            }
            btn.disabled = false;
        });

        Utils.bindClick("toolOutputCopy", function () {
            var output = Utils.gid("toolResultOutput");
            if (output) {
                navigator.clipboard.writeText(output.textContent);
            }
        });

        Utils.bindClick("progressCancel", Progress.cancelProgress);
        Utils.bindClick("progressClose", Progress.closeProgress);
        Utils.bindClick("progressMinimize", function () {
            var box = Utils.gid("progress-box");
            if (box) {
                box.classList.toggle("minimized");
            }
        });

        Utils.bindClick("reader-exit", PdfReader.exitReader);

        document.querySelectorAll(".card-cover").forEach(function (cover) {
            cover.addEventListener("click", function () {
                var card = cover.closest(".card");
                if (ViewMode.getViewMode() === "native") {
                    ServerControl.openNativePdf(card);
                } else {
                    PdfReader.readPdf(card);
                }
            });
        });
    }

    function initState() {
        var saved = Utils.lsGet("@sidebarState", "");
        if (Utils.isMobile() || saved === "collapsed") {
            Sidebar.setSidebar(false);
        }
        var sort = Utils.lsGet("@catalogSort", "name");
        if (sort !== "time") {
            sort = "name";
        }
        Utils.gid("sortSelect").value = sort;
        if (sort === "name") {
            Sort.sortByName();
        } else {
            Sort.sortByTime();
        }
        TreeNav.allCollapsed = true;
        TreeNav.setNodeExpandedRecursive(TREE, false);
        TreeNav.updateAllCollapsedFromHeaders();
    }

    function init() {
        Theme.initTheme();
        Sidebar.initSidebarResize();
        TreeNav.renderTree();
        bindEvents();
        initState();
        ViewMode.updateViewModeBtn();
        document.addEventListener("keydown", Shortcuts.handleGlobalShortcut);
    }

    return {
        init: init,
    };
})();

// 应用配置
var CatalogConfig = window.CATALOG_CONFIG || {};
var TREE = CatalogConfig.tree || [];

// 启动应用
document.addEventListener("DOMContentLoaded", Bootstrap.init);

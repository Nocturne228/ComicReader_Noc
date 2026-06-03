/**
 * 快捷键模块
 * 负责全局键盘快捷键的处理
 */
var Shortcuts = (function () {
    "use strict";

    function handleGlobalShortcut(event) {
        if (Utils.isTextEntryTarget(event.target) || PdfReader.isReaderVisible()) {
            return;
        }
        if (event.metaKey || event.ctrlKey) return;

        var key = event.key;

        // 检查重启确认对话框
        if (Utils.gid("restartDialog").style.display === "flex") {
            if (key === "Escape") {
                Restart.closeRestartDialog();
                event.preventDefault();
                return;
            }
            if (key === "Enter") {
                Utils.gid("restartConfirm").click();
                event.preventDefault();
                return;
            }
            return;
        }

        // 检查重启进度对话框
        if (Utils.gid("restartProgressDialog").style.display === "flex") {
            return;
        }

        if (key === "Escape") {
            if (ServerControl.isShortcutHelpVisible()) {
                ServerControl.setShortcutHelp(false);
                event.preventDefault();
                return;
            }
            if (Tools.isToolDialogVisible()) {
                Tools.closeToolDialog();
                event.preventDefault();
            }
            return;
        }

        if (key === "?") {
            event.preventDefault();
            ServerControl.toggleShortcutHelp();
            return;
        }

        if (ServerControl.isShortcutHelpVisible() || Tools.isToolDialogVisible()) {
            return;
        }

        if (key === "/") {
            event.preventDefault();
            var search = Utils.gid("searchInput");
            if (search) {
                search.focus();
                search.select();
            }
            return;
        }

        if (key === "b" || key === "B") {
            event.preventDefault();
            Sidebar.toggleSidebar();
            return;
        }

        if (key === "f" || key === "F") {
            event.preventDefault();
            TreeNav.toggleFoldAll();
            return;
        }

        if ((key === "v" || key === "V") && Utils.gid("toggleViewModeBtn")) {
            event.preventDefault();
            ViewMode.toggleViewMode();
            return;
        }

        if (key === "c" || key === "C") {
            event.preventDefault();
            PdfReader.clearReaderCache();
            return;
        }

        if ((key === "r" || key === "R") && CatalogConfig.serverControl && Utils.gid("refreshCatalogBtn")) {
            event.preventDefault();
            ServerControl.refreshCatalog();
            return;
        }

        if ((key === "p" || key === "P") && CatalogConfig.serverControl) {
            event.preventDefault();
            Utils.gid("restartDialog").style.display = "flex";
            return;
        }

        if ((key === "x" || key === "y" || key === "z") && CatalogConfig.serverControl) {
            if (Tools.isToolDialogVisible()) return;
            event.preventDefault();
            Tools.openToolDialog(key);
            return;
        }
    }

    return {
        handleGlobalShortcut: handleGlobalShortcut,
    };
})();

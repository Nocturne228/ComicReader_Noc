import { CONFIG } from "./config.js";
import { gid } from "./utils.js";
import { isReaderVisible, exitReader, clearReaderCache } from "./reader.js";
import { toggleSidebar } from "./sidebar.js";
import { toggleFoldAll } from "./tree.js";
import { closeRestartDialog } from "./dialogs.js";
import { refreshCatalog } from "./server-control.js";
import { toggleViewMode } from "./events.js";

function isTextEntryTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isShortcutHelpVisible() {
    return gid("shortcutHelp").style.display === "flex";
}

function setShortcutHelp(open) {
    gid("shortcutHelp").style.display = open ? "flex" : "none";
}

export function toggleShortcutHelp() {
    setShortcutHelp(!isShortcutHelpVisible());
}

export function initShortcuts() {
    document.addEventListener("keydown", function (event) {
        var key = event.key;

        if (key === "Escape" && isReaderVisible()) {
            exitReader();
            event.preventDefault();
            return;
        }

        if (isTextEntryTarget(event.target) || isReaderVisible()) return;
        if (event.metaKey || event.ctrlKey) return;

        if (gid("restartDialog").style.display === "flex") {
            if (key === "Escape") {
                closeRestartDialog();
                event.preventDefault();
                return;
            }
            if (key === "Enter") {
                gid("restartConfirm").click();
                event.preventDefault();
                return;
            }
            return;
        }

        if (gid("restartProgressDialog").style.display === "flex") {
            if (key === "Escape") return;
            return;
        }

        if (key === "Escape") {
            if (isShortcutHelpVisible()) {
                setShortcutHelp(false);
                event.preventDefault();
                return;
            }
            return;
        }

        if (key === "?") {
            event.preventDefault();
            toggleShortcutHelp();
            return;
        }

        if (isShortcutHelpVisible()) return;

        if (key === "/") {
            event.preventDefault();
            var search = gid("searchInput");
            if (search) {
                search.focus();
                search.select();
            }
            return;
        }

        if (key === "b" || key === "B") {
            event.preventDefault();
            toggleSidebar();
            return;
        }

        if (key === "f" || key === "F") {
            event.preventDefault();
            toggleFoldAll();
            return;
        }

        if ((key === "v" || key === "V") && gid("toggleViewModeBtn")) {
            event.preventDefault();
            toggleViewMode();
            return;
        }

        if (key === "c" || key === "C") {
            event.preventDefault();
            clearReaderCache();
            return;
        }

        if ((key === "r" || key === "R") && CONFIG.serverControl && gid("refreshCatalogBtn")) {
            event.preventDefault();
            refreshCatalog();
            return;
        }

        if ((key === "p" || key === "P") && CONFIG.serverControl) {
            event.preventDefault();
            gid("restartDialog").style.display = "flex";
            return;
        }
    });
}

import { initTheme } from "./modules/theme.js";
import { initSidebarResize } from "./modules/sidebar.js";
import { renderTree } from "./modules/tree.js";
import { bindEvents } from "./modules/events.js";
import { initShortcuts } from "./modules/shortcuts.js";
import { initContextMenu } from "./modules/context-menu.js";

document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initSidebarResize();
    renderTree();
    bindEvents();
    initShortcuts();
    initContextMenu();
});

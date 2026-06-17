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

    try {
        var scrollY = sessionStorage.getItem("@scrollY");
        if (scrollY !== null) {
            sessionStorage.removeItem("@scrollY");
            window.scrollTo(0, parseInt(scrollY, 10));
        }
        var sidebarScroll = sessionStorage.getItem("@sidebarScroll");
        if (sidebarScroll !== null) {
            sessionStorage.removeItem("@sidebarScroll");
            var sidebar = document.getElementById("sidebarTree");
            if (sidebar) sidebar.scrollTop = parseInt(sidebarScroll, 10);
        }
    } catch (e) {}
});

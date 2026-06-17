import { gid, clamp, lsSet } from "./utils.js";
import { TREE } from "./config.js";

var SIDEBAR_STATE = "@sidebarState";
var DEFAULT_SIDEBAR_WIDTH = 268;
var MIN_SIDEBAR_WIDTH = 220;
var MAX_SIDEBAR_WIDTH = 520;

function applySidebarWidth(width) {
    var safeWidth = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
    document.documentElement.style.setProperty("--sidebar-width", safeWidth + "px");
    return safeWidth;
}

export function initSidebarResize() {
    var resizer = gid("sidebarResizer");
    if (!resizer) return;
    applySidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    var startResize = function (event) {
        if (document.body.classList.contains("resizing-sidebar")) return;
        event.preventDefault();
        setSidebar(true);
        document.body.classList.add("resizing-sidebar");
        var onMove = function (moveEvent) { applySidebarWidth(moveEvent.clientX); };
        var onUp = function () {
            document.body.classList.remove("resizing-sidebar");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        if (event.pointerId != null && resizer.setPointerCapture) {
            resizer.setPointerCapture(event.pointerId);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };
    resizer.addEventListener("pointerdown", startResize);
}

export function setSidebar(open) {
    var sidebar = gid("sidebar");
    var expandButton = gid("sidebarToggle");
    sidebar.classList.toggle("collapsed", !open);
    expandButton.classList.toggle("visible", !open);
    lsSet(SIDEBAR_STATE, open ? "open" : "collapsed");
}

export function toggleSidebar() {
    var sidebar = gid("sidebar");
    setSidebar(sidebar.classList.contains("collapsed"));
}

export function updateTreeChildrenHeight(children, expanded) {
    if (!children) return;
    var rows = children.querySelectorAll(".tree-row");
    children.style.maxHeight = expanded ? rows.length * 32 + "px" : "0";
}

export function findFolderHeader(folder) {
    return Array.from(document.querySelectorAll(".folder-header")).find(function (item) {
        return (item.dataset.folder || "") === (folder || "");
    });
}

function findTreeFolderRow(node) {
    var normalized = node.folder || "";
    return Array.from(document.querySelectorAll(".tree-row.folder")).find(function (row) {
        var name = row.querySelector(".tree-name");
        return (row.dataset.folder || "") === normalized && name && name.textContent === node.name;
    });
}

function applySidebarFolderState(node, expanded) {
    var row = findTreeFolderRow(node);
    if (!row) return;
    var toggle = row.querySelector(".tree-toggle:not(.leaf)");
    var icon = row.querySelector(".tree-icon");
    var children = row.parentNode.querySelector(".tree-children");
    if (toggle) toggle.classList.toggle("open", expanded);
    if (icon) icon.textContent = expanded ? "📂" : "📁";
    if (children) {
        children.classList.toggle("collapsed", !expanded);
        updateTreeChildrenHeight(children, expanded);
    }
}

export function syncMainFolder(folder, expanded, scroll) {
    var header = findFolderHeader(folder);
    if (!header) return;
    header.classList.toggle("collapsed", !expanded);
    updateAllCollapsedFromHeaders();
    if (expanded && scroll) {
        var catalogTop = document.querySelector(".catalog-top");
        var headerHeight = catalogTop ? catalogTop.offsetHeight : 60;
        var rect = header.getBoundingClientRect();
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({ top: scrollTop + rect.top - headerHeight + 2, behavior: "smooth" });
    }
}

var _allCollapsed = false;

export function updateAllCollapsedFromHeaders() {
    _allCollapsed = Array.from(document.querySelectorAll(".folder-header")).every(function (item) {
        return item.classList.contains("collapsed");
    });
    var btn = gid("toggleFoldBtn");
    if (btn) {
        btn.textContent = _allCollapsed ? "全部展开" : "全部折叠";
        btn.title = _allCollapsed ? "展开全部目录" : "折叠全部目录";
    }
}

export function isAllCollapsed() {
    return _allCollapsed;
}

export function setAllCollapsed(value) {
    _allCollapsed = value;
}

function findTreePathByFolder(nodes, folder, path) {
    var normalized = folder || "";
    for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        var nextPath = path.concat(node);
        if (node.children && node.children.length) {
            var childPath = findTreePathByFolder(node.children, normalized, nextPath);
            if (childPath) return childPath;
        }
        if (node.type === "dir" && (node.folder || "") === normalized) {
            return nextPath;
        }
    }
    return null;
}

export function syncSidebarFolder(folder, expanded) {
    var path = findTreePathByFolder(TREE, folder, []);
    if (!path) return;
    if (expanded) {
        path.forEach(function (node) {
            if (node.type === "dir") {
                node.expanded = true;
                applySidebarFolderState(node, true);
            }
        });
        return;
    }
    var target = path[path.length - 1];
    if (target && target.type === "dir") {
        target.expanded = false;
        applySidebarFolderState(target, false);
    }
}

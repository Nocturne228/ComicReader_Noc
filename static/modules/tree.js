import { gid } from "./utils.js";
import { TREE } from "./config.js";
import {
    syncMainFolder,
    closeSidebarOnMobile,
    updateTreeChildrenHeight,
    findFolderHeader,
    updateAllCollapsedFromHeaders,
    isAllCollapsed,
    setAllCollapsed,
} from "./sidebar.js";

export function setNodeExpandedRecursive(nodes, expanded) {
    nodes.forEach(function (node) {
        if (node.type === "dir") node.expanded = expanded;
        if (node.children && node.children.length) {
            setNodeExpandedRecursive(node.children, expanded);
        }
    });
}

function toggleTreeNode(node, toggle, icon) {
    var expanded = !node.expanded;
    node.expanded = expanded;
    toggle.classList.toggle("open", expanded);
    icon.textContent = expanded ? "📂" : "📁";
    var children = toggle.closest(".tree-node").querySelector(".tree-children");
    if (children) {
        children.classList.toggle("collapsed", !expanded);
        updateTreeChildrenHeight(children, expanded);
    }
    syncMainFolder(node.folder || "", expanded, expanded);
}

function buildTree(container, nodes, depth) {
    nodes.forEach(function (node) {
        var item = document.createElement("div");
        var row = document.createElement("div");
        item.className = "tree-node";
        row.className = "tree-row" + (node.type === "dir" ? " folder" : "");
        row.style.paddingLeft = 6 + depth * 16 + "px";
        if (node.index != null) row.setAttribute("data-index", node.index);
        if (node.folder != null) row.setAttribute("data-folder", node.folder);

        var toggle = document.createElement("span");
        toggle.className = "tree-toggle" + (node.type === "pdf" ? " leaf" : node.expanded ? " open" : "");
        toggle.textContent = "▶";
        row.appendChild(toggle);

        var icon = document.createElement("span");
        icon.className = "tree-icon";
        icon.textContent = node.type === "dir" ? (node.expanded ? "📂" : "📁") : "📄";
        row.appendChild(icon);

        var name = document.createElement("span");
        name.className = "tree-name";
        name.textContent = node.name;
        name.title = node.name;
        row.appendChild(name);

        if (node.type === "dir") {
            toggle.addEventListener("click", function (event) {
                event.stopPropagation();
                toggleTreeNode(node, toggle, icon);
            });
            row.addEventListener("click", function (event) {
                if (event.target === toggle) return;
                toggleTreeNode(node, toggle, icon);
            });
        } else {
            row.addEventListener("click", function () {
                scrollToCard(node.index);
                closeSidebarOnMobile();
            });
        }

        item.appendChild(row);
        if (node.children && node.children.length) {
            var children = document.createElement("div");
            children.className = "tree-children" + (node.expanded ? "" : " collapsed");
            buildTree(children, node.children, depth + 1);
            updateTreeChildrenHeight(children, node.expanded);
            item.appendChild(children);
        }
        container.appendChild(item);
    });
}

export function renderTree() {
    var container = gid("sidebarTree");
    container.innerHTML = "";
    buildTree(container, TREE, 0);
}

export function highlightCard(index) {
    document.querySelectorAll(".card.highlight").forEach(function (card) {
        card.classList.remove("highlight");
    });
    var card = gid("card-" + index);
    if (card) card.classList.add("highlight");
}

export function scrollToCard(index) {
    var card = gid("card-" + index);
    if (card) {
        var folder = card.dataset.folder || "";
        var header = findFolderHeader(folder);
        if (header && header.classList.contains("collapsed")) {
            header.classList.remove("collapsed");
            updateAllCollapsedFromHeaders();
        }
    }
    highlightCard(index);
    if (card) {
        var rect = card.getBoundingClientRect();
        var viewportHeight = window.innerHeight;
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        window.scrollTo({
            top: scrollTop + rect.top - viewportHeight / 2 + rect.height / 2,
            behavior: "smooth",
        });
    }
    var node = document.querySelector('.tree-row[data-index="' + index + '"]');
    if (node) {
        document.querySelectorAll(".tree-row.active").forEach(function (row) {
            row.classList.remove("active");
        });
        node.classList.add("active");
        node.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
}

export function foldAll(collapse) {
    setAllCollapsed(collapse);
    setNodeExpandedRecursive(TREE, !collapse);
    document.querySelectorAll(".tree-row.folder").forEach(function (row) {
        var toggle = row.querySelector(".tree-toggle:not(.leaf)");
        if (!toggle) return;
        toggle.classList.toggle("open", !collapse);
        var children = row.parentNode.querySelector(".tree-children");
        if (children) {
            children.classList.toggle("collapsed", collapse);
            updateTreeChildrenHeight(children, !collapse);
        }
    });
    document.querySelectorAll(".folder-header").forEach(function (header) {
        header.classList.toggle("collapsed", collapse);
    });
    updateFoldToggleButton();
}

export function updateFoldToggleButton() {
    var button = gid("toggleFoldBtn");
    if (!button) return;
    button.textContent = isAllCollapsed() ? "全部展开" : "全部折叠";
    button.title = isAllCollapsed() ? "展开全部目录" : "折叠全部目录";
}

export function toggleFoldAll() {
    foldAll(!isAllCollapsed());
}

import { gid } from "./utils.js";
import { renderTree, updateFoldToggleButton } from "./tree.js";
import { updateTreeChildrenHeight } from "./sidebar.js";

var savedFolderHeaderStates = {};
var savedTreeChildrenStates = {};

export function filterTree(query) {
    var q = query.trim().toLowerCase();

    if (!q) {
        renderTree();
        updateFoldToggleButton();
        document.querySelectorAll(".card").forEach(function (card) { card.style.display = ""; });
        document.querySelectorAll(".folder-group").forEach(function (group) { group.style.display = ""; });
        document.querySelectorAll(".folder-header").forEach(function (h) {
            var folder = h.dataset.folder || "";
            if (savedFolderHeaderStates.hasOwnProperty(folder)) {
                h.classList.toggle("collapsed", savedFolderHeaderStates[folder]);
            } else {
                h.classList.remove("collapsed");
            }
        });
        savedFolderHeaderStates = {};
        document.querySelectorAll(".tree-children").forEach(function (children, index) {
            var key = children.getAttribute("data-tree-key") || String(index);
            if (savedTreeChildrenStates.hasOwnProperty(key)) {
                children.classList.toggle("collapsed", savedTreeChildrenStates[key]);
                updateTreeChildrenHeight(children, !savedTreeChildrenStates[key]);
            } else {
                children.classList.remove("collapsed");
                updateTreeChildrenHeight(children, true);
            }
        });
        savedTreeChildrenStates = {};
        return;
    }

    if (Object.keys(savedFolderHeaderStates).length === 0) {
        document.querySelectorAll(".folder-header").forEach(function (h) {
            savedFolderHeaderStates[h.dataset.folder || ""] = h.classList.contains("collapsed");
        });
        document.querySelectorAll(".tree-children").forEach(function (children, index) {
            var key = children.getAttribute("data-tree-key") || String(index);
            if (!children.getAttribute("data-tree-key")) children.setAttribute("data-tree-key", key);
            savedTreeChildrenStates[key] = children.classList.contains("collapsed");
        });
    }

    var re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "$&"), "i") : null;
    document.querySelectorAll(".tree-row:not(.folder)").forEach(function (row) {
        var matchesTitle = !re || re.test(row.textContent);
        row.style.display = matchesTitle ? "" : "none";
    });
    Array.from(document.querySelectorAll(".tree-node")).reverse().forEach(function (node) {
        var row = node.firstElementChild;
        if (!row || !row.classList.contains("folder")) return;
        var hasMatch = Array.from(node.querySelectorAll(".tree-row:not(.folder)")).some(function (pdfRow) {
            return pdfRow.style.display !== "none";
        });
        row.style.display = hasMatch ? "" : "none";
        var children = node.querySelector(".tree-children");
        if (children) {
            children.classList.toggle("collapsed", !hasMatch);
            updateTreeChildrenHeight(children, hasMatch);
        }
    });

    document.querySelectorAll(".card").forEach(function (card) {
        var title = (card.dataset.title || "").toLowerCase();
        card.style.display = !re || title.includes(q) ? "" : "none";
    });
    document.querySelectorAll(".folder-group").forEach(function (group) {
        var hasVisible = Array.from(group.querySelectorAll(".card")).some(function (c) {
            return c.style.display !== "none";
        });
        group.style.display = hasVisible ? "" : "none";
        var header = group.querySelector(".folder-header");
        if (header) header.classList.toggle("collapsed", !hasVisible);
    });
}

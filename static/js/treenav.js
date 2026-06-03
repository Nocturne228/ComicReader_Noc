/**
 * 树导航模块
 * 负责树形目录的构建、展开/折叠、文件夹同步
 */
var TreeNav = (function () {
    "use strict";

    var allCollapsed = false;

    function updateTreeChildrenHeight(children, expanded) {
        if (expanded) {
            children.style.maxHeight = children.scrollHeight + "px";
            setTimeout(function () {
                children.style.maxHeight = "none";
            }, 220);
        } else {
            children.style.maxHeight = children.scrollHeight + "px";
            requestAnimationFrame(function () {
                children.style.maxHeight = "0";
            });
        }
    }

    function setNodeExpandedRecursive(nodes, expanded) {
        nodes.forEach(function (node) {
            if (node.type === "dir") {
                node.expanded = expanded;
                if (node.children) {
                    setNodeExpandedRecursive(node.children, expanded);
                }
            }
        });
    }

    function findFolderHeader(folder) {
        return Array.from(document.querySelectorAll(".folder-header")).find(
            function (h) {
                return h.getAttribute("data-folder") === folder;
            },
        );
    }

    function findTreePathByFolder(nodes, folder, path) {
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var currentPath = path.concat([node]);
            if (node.type === "dir") {
                if (node.folder === folder) {
                    return currentPath;
                }
                if (node.children) {
                    var found = findTreePathByFolder(
                        node.children,
                        folder,
                        currentPath,
                    );
                    if (found) {
                        return found;
                    }
                }
            }
        }
        return null;
    }

    function findTreeFolderRow(node) {
        var rows = document.querySelectorAll("#sidebarTree .tree-row");
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].dataset.node === node) {
                return rows[i];
            }
        }
        return null;
    }

    function updateAllCollapsedFromHeaders() {
        var headers = document.querySelectorAll(".folder-header");
        var anyExpanded = Array.from(headers).some(function (h) {
            return !h.classList.contains("collapsed");
        });
        allCollapsed = !anyExpanded;
        updateFoldToggleButton();
    }

    function highlightCard(index) {
        document.querySelectorAll(".card.highlight").forEach(function (c) {
            c.classList.remove("highlight");
        });
        var card = document.querySelector('.card[data-index="' + index + '"]');
        if (card) {
            card.classList.add("highlight");
        }
    }

    function scrollToCard(index) {
        highlightCard(index);
        var card = document.querySelector('.card[data-index="' + index + '"]');
        if (!card) {
            return;
        }
        var header = findFolderHeader(card.dataset.folder);
        if (header) {
            header.classList.remove("collapsed");
            updateAllCollapsedFromHeaders();
        }
        var catalogTop = document.querySelector('.catalog-top');
        var headerHeight = catalogTop ? catalogTop.offsetHeight : 60;
        var rect = card.getBoundingClientRect();
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        var targetScrollTop = scrollTop + rect.top - headerHeight - 32;
        window.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    }

    function syncMainFolder(folder, expanded, scroll) {
        var header = findFolderHeader(folder);
        if (!header) {
            return;
        }
        header.classList.toggle("collapsed", !expanded);
        updateAllCollapsedFromHeaders();
        if (expanded && scroll) {
            var catalogTop = document.querySelector('.catalog-top');
            var headerHeight = catalogTop ? catalogTop.offsetHeight : 60;
            var rect = header.getBoundingClientRect();
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var targetScrollTop = scrollTop + rect.top - headerHeight;
            window.scrollTo({
                top: targetScrollTop,
                behavior: "smooth",
            });
        }
    }

    function applySidebarFolderState(node, expanded) {
        var row = findTreeFolderRow(node);
        if (!row) {
            return;
        }
        var toggle = row.querySelector(".tree-toggle:not(.leaf)");
        var icon = row.querySelector(".tree-icon");
        var children = row.parentNode.querySelector(".tree-children");
        if (toggle) {
            toggle.classList.toggle("open", expanded);
        }
        if (icon) {
            icon.textContent = expanded ? "📂" : "📁";
        }
        if (children) {
            children.classList.toggle("collapsed", !expanded);
            updateTreeChildrenHeight(children, expanded);
        }
    }

    function syncSidebarFolder(folder, expanded) {
        var path = findTreePathByFolder(TREE, folder, []);
        if (!path) {
            return;
        }
        if (expanded) {
            path.forEach(function (node) {
                if (node.type === "dir") {
                    applySidebarFolderState(node, true);
                }
            });
        } else {
            var last = path[path.length - 1];
            if (last.type === "dir") {
                applySidebarFolderState(last, false);
            }
        }
    }

    function setTreeNodeExpanded(node, toggle, icon, expanded, scrollMain) {
        node.expanded = expanded;
        updateTreeChildrenHeight(toggle.parentNode.querySelector(".tree-children"), expanded);
        toggle.classList.toggle("open", expanded);
        icon.textContent = expanded ? "📂" : "📁";
        if (node.folder && scrollMain) {
            syncMainFolder(node.folder, expanded, true);
        }
    }

    function toggleTreeNode(node, toggle, icon) {
        setTreeNodeExpanded(node, toggle, icon, !node.expanded, true);
    }

    function buildTree(container, nodes, depth) {
        var list = document.createElement("div");
        list.className = "tree-list" + (depth > 0 ? " tree-list-inner" : "");
        nodes.forEach(function (node) {
            if (node.type === "dir") {
                var wrapper = document.createElement("div");
                wrapper.className = "tree-node";
                var row = document.createElement("div");
                row.className = "tree-row";
                row.dataset.node = node;
                row.style.paddingLeft = depth * 16 + "px";
                var toggle = document.createElement("span");
                toggle.className =
                    "tree-toggle" + (node.expanded ? " open" : "");
                toggle.textContent = "▶";
                var icon = document.createElement("span");
                icon.className = "tree-icon";
                icon.textContent = node.expanded ? "📂" : "📁";
                var label = document.createElement("span");
                label.className = "tree-label";
                label.textContent = node.name;
                row.appendChild(toggle);
                row.appendChild(icon);
                row.appendChild(label);
                wrapper.appendChild(row);
                var children = document.createElement("div");
                children.className =
                    "tree-children" + (node.expanded ? "" : " collapsed");
                if (node.children) {
                    buildTree(children, node.children, depth + 1);
                }
                wrapper.appendChild(children);
                list.appendChild(wrapper);
                row.addEventListener("click", function () {
                    toggleTreeNode(node, toggle, icon);
                });
            } else {
                var leafRow = document.createElement("div");
                leafRow.className = "tree-row tree-leaf";
                leafRow.style.paddingLeft = depth * 16 + 28 + "px";
                var leafIcon = document.createElement("span");
                leafIcon.className = "tree-icon";
                leafIcon.textContent = "📄";
                var leafLabel = document.createElement("span");
                leafLabel.className = "tree-label";
                leafLabel.textContent = node.name;
                leafRow.appendChild(leafIcon);
                leafRow.appendChild(leafLabel);
                list.appendChild(leafRow);
                leafRow.addEventListener("click", function () {
                    var idx = node.index;
                    if (typeof idx === "number") {
                        scrollToCard(idx);
                        Sidebar.closeSidebarOnMobile();
                    }
                });
            }
        });
        container.appendChild(list);
    }

    function renderTree() {
        var container = Utils.gid("sidebarTree");
        if (!container) {
            return;
        }
        container.innerHTML = "";
        buildTree(container, TREE, 0);
    }

    function filterTree(query) {
        var q = (query || "").trim().toLowerCase();
        var rows = document.querySelectorAll("#sidebarTree .tree-row");
        if (!q) {
            rows.forEach(function (r) {
                r.style.display = "";
            });
            renderTree();
            updateFoldToggleButton();
            return;
        }
        var tree = Utils.gid("sidebarTree");
        if (tree) {
            tree.innerHTML = "";
        }
        var filtered = [];
        function walk(nodes, depth) {
            nodes.forEach(function (node) {
                if (node.type === "dir") {
                    var childMatches = false;
                    if (node.children) {
                        var dirHasMatch = node.children.some(function (c) {
                            if (c.type === "dir") {
                                var subChildren = c.children || [];
                                return subChildren.some(function (leaf) {
                                    return leaf.name
                                        .toLowerCase()
                                        .includes(q);
                                });
                            }
                            return c.name.toLowerCase().includes(q);
                        });
                        childMatches = dirHasMatch;
                    }
                    if (
                        node.name.toLowerCase().includes(q) ||
                        childMatches
                    ) {
                        var dirNode = Object.assign({}, node, {
                            expanded: true,
                        });
                        if (node.children) {
                            var children = [];
                            function filterChildren(
                                srcChildren,
                                target,
                            ) {
                                srcChildren.forEach(function (child) {
                                    if (child.type === "dir") {
                                        var subMatches =
                                            child.children &&
                                            child.children.some(
                                                function (sub) {
                                                    return sub.name
                                                        .toLowerCase()
                                                        .includes(q);
                                                },
                                            );
                                        if (subMatches) {
                                            var newChild = Object.assign(
                                                {},
                                                child,
                                                { expanded: true },
                                            );
                                            newChild.children = [];
                                            filterChildren(
                                                child.children,
                                                newChild.children,
                                            );
                                            target.push(newChild);
                                        }
                                    } else if (
                                        child.name
                                            .toLowerCase()
                                            .includes(q)
                                    ) {
                                        target.push(child);
                                    }
                                });
                            }
                            filterChildren(node.children, children);
                            dirNode.children = children;
                        }
                        filtered.push(dirNode);
                    }
                } else if (node.name.toLowerCase().includes(q)) {
                    filtered.push(node);
                }
            });
        }
        walk(TREE, 0);
        filtered.forEach(function (node) {
            if (node.type === "dir") {
                node.expanded = true;
            }
        });
        buildTree(tree, filtered, 0);
        updateFoldToggleButton();
    }

    function updateFoldToggleButton() {
        var button = Utils.gid("toggleFoldBtn");
        if (!button) {
            return;
        }
        button.textContent = allCollapsed ? "全部展开" : "全部折叠";
        button.title = allCollapsed ? "展开全部目录" : "折叠全部目录";
    }

    function foldAll(collapse) {
        allCollapsed = collapse;
        document.querySelectorAll(".folder-header").forEach(function (header) {
            header.classList.toggle("collapsed", collapse);
        });
        updateFoldToggleButton();
    }

    function toggleFoldAll() {
        foldAll(!allCollapsed);
    }

    return {
        allCollapsed: allCollapsed,
        updateTreeChildrenHeight: updateTreeChildrenHeight,
        setNodeExpandedRecursive: setNodeExpandedRecursive,
        findFolderHeader: findFolderHeader,
        findTreePathByFolder: findTreePathByFolder,
        findTreeFolderRow: findTreeFolderRow,
        updateAllCollapsedFromHeaders: updateAllCollapsedFromHeaders,
        highlightCard: highlightCard,
        scrollToCard: scrollToCard,
        syncMainFolder: syncMainFolder,
        applySidebarFolderState: applySidebarFolderState,
        syncSidebarFolder: syncSidebarFolder,
        setTreeNodeExpanded: setTreeNodeExpanded,
        toggleTreeNode: toggleTreeNode,
        buildTree: buildTree,
        renderTree: renderTree,
        filterTree: filterTree,
        updateFoldToggleButton: updateFoldToggleButton,
        foldAll: foldAll,
        toggleFoldAll: toggleFoldAll,
    };
})();

/**
 * ComicReadScript Catalog - Main Application Module
 *
 * This module handles the main UI interactions for the comic catalog,
 * including theme switching, sidebar navigation, PDF reading, and
 * keyboard shortcuts.
 *
 * @fileoverview Main application logic for the comic catalog interface.
 */
(function () {
    var CONFIG = window.CATALOG_CONFIG || {};
    var TREE = CONFIG.tree || [];
    var UMD_PATH = CONFIG.umdPath || "vendor/ComicReader.umd.js";
    var PDFJS_LOCAL_PATH = CONFIG.pdfjsLocalPath || "vendor/pdfjs/pdf.min.mjs";
    var PDFJS_WORKER_PATH =
        CONFIG.pdfjsWorkerPath || "vendor/pdfjs/pdf.worker.min.mjs";
    var RENDER_CONCURRENCY = CONFIG.renderConcurrency || 2;
    var PAGE_TITLE = CONFIG.title || "Nocturne Manga";

    var CR = null;
    var PDF = null;
    var activeJob = null;
    var SIDEBAR_STATE = "@sidebarState";
    var DEFAULT_SIDEBAR_WIDTH = 268;
    var MIN_SIDEBAR_WIDTH = 220;
    var MAX_SIDEBAR_WIDTH = 520;
    var allCollapsed = false;
    var savedFolderHeaderStates = {};
    var savedTreeChildrenStates = {};
    var VIEW_MODE = lsGet("@viewMode", "reader");
    var THEME_KEY = "@theme";

    /**
     * Apply theme (light or dark) to the document.
     * @param {boolean} isDark - Whether to apply dark theme.
     */
    function applyTheme(isDark) {
        if (isDark) {
            document.documentElement.classList.add("dark-theme");
        } else {
            document.documentElement.classList.remove("dark-theme");
        }
        var icon = gid("themeIcon");
        var toggle = gid("themeToggle");
        if (icon) {
            icon.textContent = isDark ? "🌙" : "☀️";
        }
        if (toggle) {
            toggle.setAttribute("aria-checked", isDark ? "true" : "false");
            toggle.title = isDark ? "切换到日间模式" : "切换到夜间模式";
        }
    }

    /**
     * Toggle between light and dark themes.
     */
    function toggleTheme() {
        var isDark = document.documentElement.classList.contains("dark-theme");
        var newIsDark = !isDark;
        lsSet(THEME_KEY, newIsDark ? "dark" : "light");
        applyTheme(newIsDark);
    }

    /**
     * Initialize theme from saved preference or default to light.
     */
    function initTheme() {
        var saved = lsGet(THEME_KEY, null);
        if (saved === "dark") {
            applyTheme(true);
        } else if (saved === "light") {
            applyTheme(false);
        } else {
            // Default to light theme when no saved preference
            applyTheme(false);
        }
    }

    /**
     * Update the view mode button text and state.
     */
    function updateViewModeBtn() {
        var btn = gid("toggleViewModeBtn");
        if (!btn) {
            return;
        }
        if (!CONFIG.nativeOpenEnabled) {
            VIEW_MODE = "reader";
            btn.disabled = true;
            btn.textContent = "网页阅读";
            btn.title = "Preview 打开需要通过 --serve 启动本地服务";
            btn.classList.remove("active");
            return;
        }
        btn.textContent = VIEW_MODE === "native" ? "Preview" : "网页阅读";
        btn.title =
            VIEW_MODE === "native"
                ? "点击卡片时使用 macOS Preview 打开 PDF"
                : "点击卡片时使用内置网页阅读器";
        btn.classList.toggle("active", VIEW_MODE === "native");
    }

    /**
     * Toggle between web reader and native Preview mode.
     */
    function toggleViewMode() {
        if (!CONFIG.nativeOpenEnabled) {
            return;
        }
        VIEW_MODE = VIEW_MODE === "reader" ? "native" : "reader";
        lsSet("@viewMode", VIEW_MODE);
        updateViewModeBtn();
    }

    /**
     * Get element by ID (shorthand for getElementById).
     * @param {string} id - Element ID.
     * @returns {HTMLElement|null} The element or null if not found.
     */
    function gid(id) {
        return document.getElementById(id);
    }

    /**
     * Bind click event handler to an element.
     * @param {string} id - Element ID.
     * @param {Function} handler - Click event handler.
     */
    function bindClick(id, handler) {
        var element = gid(id);
        if (element) {
            element.addEventListener("click", handler);
        }
    }

    /**
     * Check if the current viewport is mobile-sized.
     * @returns {boolean} True if viewport width <= 768px.
     */
    function isMobile() {
        return window.matchMedia("(max-width: 768px)").matches;
    }

    /**
     * Dynamically load a JavaScript script.
     * @param {string} url - Script URL to load.
     * @returns {Promise<void>} Resolves when script is loaded.
     */
    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            if (document.querySelector('script[src="' + url + '"]')) {
                resolve();
                return;
            }
            var script = document.createElement("script");
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Get value from localStorage with JSON parsing.
     * @param {string} key - Storage key.
     * @param {*} fallback - Default value if key not found or parse error.
     * @returns {*} Parsed value or fallback.
     */
    function lsGet(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (err) {
            return localStorage.getItem(key) || fallback;
        }
    }

    /**
     * Set value in localStorage with JSON serialization.
     * @param {string} key - Storage key.
     * @param {*} value - Value to store.
     */
    function lsSet(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    /**
     * Clamp a value between min and max bounds.
     * @param {number} value - Value to clamp.
     * @param {number} min - Minimum bound.
     * @param {number} max - Maximum bound.
     * @returns {number} Clamped value.
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Apply sidebar width with clamping to allowed bounds.
     * @param {number} width - Desired width in pixels.
     * @returns {number} Actual applied width.
     */
    function applySidebarWidth(width) {
        var safeWidth = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        document.documentElement.style.setProperty(
            "--sidebar-width",
            safeWidth + "px",
        );
        return safeWidth;
    }

    /**
     * Initialize sidebar resize functionality with drag handling.
     */
    function initSidebarResize() {
        var resizer = gid("sidebarResizer");
        if (!resizer || isMobile()) {
            return;
        }
        applySidebarWidth(DEFAULT_SIDEBAR_WIDTH);
        var startResize = function (event) {
            if (isMobile()) {
                return;
            }
            if (document.body.classList.contains("resizing-sidebar")) {
                return;
            }
            event.preventDefault();
            setSidebar(true);
            document.body.classList.add("resizing-sidebar");
            var onMove = function (moveEvent) {
                applySidebarWidth(moveEvent.clientX);
            };
            var onUp = function () {
                document.body.classList.remove("resizing-sidebar");
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };
            if (event.pointerId != null && resizer.setPointerCapture) {
                resizer.setPointerCapture(event.pointerId);
            }
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        };
        resizer.addEventListener("pointerdown", startResize);
        resizer.addEventListener("mousedown", startResize);
    }

    /**
     * Set sidebar open/closed state.
     * @param {boolean} open - Whether to open the sidebar.
     */
    function setSidebar(open) {
        var sidebar = gid("sidebar");
        var expandButton = gid("sidebarToggle");
        if (isMobile()) {
            sidebar.classList.toggle("open", open);
            sidebar.classList.toggle("collapsed", !open);
            expandButton.classList.toggle("visible", !open);
            lsSet(SIDEBAR_STATE, open ? "open" : "collapsed");
            return;
        }
        sidebar.classList.toggle("collapsed", !open);
        sidebar.classList.remove("open");
        expandButton.classList.toggle("visible", !open);
        lsSet(SIDEBAR_STATE, open ? "open" : "collapsed");
    }

    function toggleSidebar() {
        var sidebar = gid("sidebar");
        setSidebar(
            isMobile()
                ? !sidebar.classList.contains("open")
                : sidebar.classList.contains("collapsed"),
        );
    }

    function closeSidebarOnMobile() {
        if (isMobile()) {
            setSidebar(false);
        }
    }

    function updateTreeChildrenHeight(children, expanded) {
        if (!children) {
            return;
        }
        var rows = children.querySelectorAll(".tree-row");
        children.style.maxHeight = expanded ? rows.length * 32 + "px" : "0";
    }

    function setNodeExpandedRecursive(nodes, expanded) {
        nodes.forEach(function (node) {
            if (node.type === "dir") {
                node.expanded = expanded;
            }
            if (node.children && node.children.length) {
                setNodeExpandedRecursive(node.children, expanded);
            }
        });
    }

    function findFolderHeader(folder) {
        return Array.from(document.querySelectorAll(".folder-header")).find(
            function (item) {
                return (item.dataset.folder || "") === (folder || "");
            },
        );
    }

    function findTreePathByFolder(nodes, folder, path) {
        var normalized = folder || "";
        for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var nextPath = path.concat(node);
            if (node.children && node.children.length) {
                var childPath = findTreePathByFolder(
                    node.children,
                    normalized,
                    nextPath,
                );
                if (childPath) {
                    return childPath;
                }
            }
            if (node.type === "dir" && (node.folder || "") === normalized) {
                return nextPath;
            }
        }
        return null;
    }

    function findTreeFolderRow(node) {
        var normalized = node.folder || "";
        return Array.from(document.querySelectorAll(".tree-row.folder")).find(
            function (row) {
                var name = row.querySelector(".tree-name");
                return (
                    (row.dataset.folder || "") === normalized &&
                    name &&
                    name.textContent === node.name
                );
            },
        );
    }

    function updateAllCollapsedFromHeaders() {
        allCollapsed = Array.from(
            document.querySelectorAll(".folder-header"),
        ).every(function (item) {
            return item.classList.contains("collapsed");
        });
        updateFoldToggleButton();
    }

    function syncMainFolder(folder, expanded, scroll) {
        var header = findFolderHeader(folder);
        if (!header) {
            return;
        }
        header.classList.toggle("collapsed", !expanded);
        updateAllCollapsedFromHeaders();
        if (expanded && scroll) {
            // 计算顶部信息栏高度，使分组标题的分隔线与顶部信息栏分隔线重合
            var catalogTop = document.querySelector('.catalog-top');
            var headerHeight = catalogTop ? catalogTop.offsetHeight : 60;
            var rect = header.getBoundingClientRect();
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            // 使分组标题顶部边框线正好位于顶部信息栏底部边框线下方
            var targetScrollTop = scrollTop + rect.top - headerHeight + 2;
            
            window.scrollTo({
                top: targetScrollTop,
                behavior: "smooth"
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

    function setTreeNodeExpanded(node, toggle, icon, expanded, scrollMain) {
        node.expanded = expanded;
        toggle.classList.toggle("open", expanded);
        icon.textContent = expanded ? "📂" : "📁";
        var children = toggle
            .closest(".tree-node")
            .querySelector(".tree-children");
        if (children) {
            children.classList.toggle("collapsed", !expanded);
            updateTreeChildrenHeight(children, expanded);
        }
        syncMainFolder(node.folder || "", expanded, Boolean(scrollMain));
    }

    function toggleTreeNode(node, toggle, icon) {
        setTreeNodeExpanded(node, toggle, icon, !node.expanded, !node.expanded);
    }

    function buildTree(container, nodes, depth) {
        nodes.forEach(function (node) {
            var item = document.createElement("div");
            var row = document.createElement("div");
            item.className = "tree-node";
            row.className = "tree-row" + (node.type === "dir" ? " folder" : "");
            row.style.paddingLeft = 6 + depth * 16 + "px";
            if (node.index != null) {
                row.setAttribute("data-index", node.index);
            }
            if (node.folder != null) {
                row.setAttribute("data-folder", node.folder);
            }

            var toggle = document.createElement("span");
            toggle.className =
                "tree-toggle" +
                (node.type === "pdf" ? " leaf" : node.expanded ? " open" : "");
            toggle.textContent = "▶";
            row.appendChild(toggle);

            var icon = document.createElement("span");
            icon.className = "tree-icon";
            icon.textContent =
                node.type === "dir" ? (node.expanded ? "📂" : "📁") : "📄";
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
                    if (event.target === toggle) {
                        return;
                    }
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
                children.className =
                    "tree-children" + (node.expanded ? "" : " collapsed");
                buildTree(children, node.children, depth + 1);
                updateTreeChildrenHeight(children, node.expanded);
                item.appendChild(children);
            }
            container.appendChild(item);
        });
    }

    function renderTree() {
        var container = gid("sidebarTree");
        container.innerHTML = "";
        buildTree(container, TREE, 0);
    }

    function highlightCard(index) {
        document.querySelectorAll(".card.highlight").forEach(function (card) {
            card.classList.remove("highlight");
        });
        var card = gid("card-" + index);
        if (card) {
            card.classList.add("highlight");
        }
    }

    function scrollToCard(index) {
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
            // 计算卡片位置，使其滚动到屏幕中心
            var rect = card.getBoundingClientRect();
            var viewportHeight = window.innerHeight;
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var targetScrollTop = scrollTop + rect.top - (viewportHeight / 2) + (rect.height / 2);
            
            window.scrollTo({
                top: targetScrollTop,
                behavior: "smooth"
            });
        }
        var node = document.querySelector(
            '.tree-row[data-index="' + index + '"]',
        );
        if (node) {
            document
                .querySelectorAll(".tree-row.active")
                .forEach(function (row) {
                    row.classList.remove("active");
                });
            node.classList.add("active");
            node.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
    }

    function filterTree(query) {
        var parsed = (typeof TagManager !== "undefined") ? TagManager.parseSearchQuery(query) : { tags: [], title: query.trim().toLowerCase() };
        var q = parsed.title;
        var filterTags = parsed.tags;

        if (!q && filterTags.length === 0) {
            renderTree();
            updateFoldToggleButton();
            document.querySelectorAll(".card").forEach(function (card) {
                card.style.display = "";
            });
            document.querySelectorAll(".folder-group").forEach(function (group) {
                group.style.display = "";
            });
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
                if (!children.getAttribute("data-tree-key")) {
                    children.setAttribute("data-tree-key", key);
                }
                savedTreeChildrenStates[key] = children.classList.contains("collapsed");
            });
        }

        var re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "$&"), "i") : null;
        document
            .querySelectorAll(".tree-row:not(.folder)")
            .forEach(function (row) {
                var index = row.getAttribute("data-index");
                var matchesTitle = !re || re.test(row.textContent);
                var matchesTags = true;
                if (filterTags.length > 0 && index != null) {
                    var card = gid("card-" + index);
                    if (card) {
                        var pdfPath = card.dataset.pdf || "";
                        matchesTags = (typeof TagManager !== "undefined") ? TagManager.matchesTagFilter(pdfPath, filterTags) : false;
                    } else {
                        matchesTags = false;
                    }
                }
                row.style.display = (matchesTitle && matchesTags) ? "" : "none";
            });
        Array.from(document.querySelectorAll(".tree-node"))
            .reverse()
            .forEach(function (node) {
                var row = node.firstElementChild;
                if (!row || !row.classList.contains("folder")) {
                    return;
                }
                var hasMatch = Array.from(
                    node.querySelectorAll(".tree-row:not(.folder)"),
                ).some(function (pdfRow) {
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
            var matchesTitle = !re || title.includes(q);
            var pdfPath = card.dataset.pdf || "";
            var matchesTags = (typeof TagManager !== "undefined") ? TagManager.matchesTagFilter(pdfPath, filterTags) : (filterTags.length === 0);
            card.style.display = (matchesTitle && matchesTags) ? "" : "none";
        });
        document.querySelectorAll(".folder-group").forEach(function (group) {
            var hasVisible = Array.from(group.querySelectorAll(".card")).some(function (c) {
                return c.style.display !== "none";
            });
            group.style.display = hasVisible ? "" : "none";
            var header = group.querySelector(".folder-header");
            if (header) {
                header.classList.toggle("collapsed", !hasVisible);
            }
        });
    }

    function foldAll(collapse) {
        allCollapsed = collapse;
        setNodeExpandedRecursive(TREE, !collapse);
        document.querySelectorAll(".tree-row.folder").forEach(function (row) {
            var toggle = row.querySelector(".tree-toggle:not(.leaf)");
            if (!toggle) {
                return;
            }
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

    function updateFoldToggleButton() {
        var button = gid("toggleFoldBtn");
        if (!button) {
            return;
        }
        button.textContent = allCollapsed ? "全部展开" : "全部折叠";
        button.title = allCollapsed ? "展开全部目录" : "折叠全部目录";
    }

    function toggleFoldAll() {
        foldAll(!allCollapsed);
    }

    function sortCards(compare) {
        document.querySelectorAll(".folder-grid").forEach(function (grid) {
            Array.from(grid.querySelectorAll(".card"))
                .sort(compare)
                .forEach(function (card) {
                    grid.appendChild(card);
                });
        });
    }

    function sortByName() {
        sortCards(function (a, b) {
            return a.dataset.title.localeCompare(b.dataset.title, undefined, {
                numeric: true,
            });
        });
    }

    function sortByTime() {
        sortCards(function (a, b) {
            return Number(b.dataset.mtime) - Number(a.dataset.mtime);
        });
    }

    function onSortChange(value) {
        if (value === "time") {
            sortByTime();
        } else {
            sortByName();
        }
        lsSet("@catalogSort", value);
    }

    function showProgress(show, text) {
        var overlay = gid("progress-overlay");
        overlay.classList.toggle("active", show);
        if (show) {
            overlay.classList.remove("error");
        }
        gid("progress-note").textContent = "";
        if (text) {
            gid("progress-text").textContent = text;
        }
    }

    function setProgress(progress) {
        gid("progress-fill").style.width = Math.round(progress * 100) + "%";
        gid("progress-text").textContent = Math.round(progress * 100) + "%";
    }

    function setProgressError(message, title) {
        var overlay = gid("progress-overlay");
        var error = gid("progress-error");
        gid("progress-title").textContent = title || "操作失败";
        gid("progress-fill").style.width = "0";
        gid("progress-text").textContent = "";
        gid("progress-note").textContent = "";
        error.textContent = message;
        error.classList.add("show");
        overlay.classList.add("active", "error");
    }

    function clearProgressError() {
        var error = gid("progress-error");
        error.classList.remove("show");
        error.textContent = "";
        gid("progress-overlay").classList.remove("error");
    }

    function closeProgress() {
        gid("progress-overlay").classList.remove("active", "error");
        gid("progress-note").textContent = "";
    }

    function cancelProgress() {
        if (activeJob) {
            activeJob.cancelled = true;
            if (activeJob.abortController) {
                activeJob.abortController.abort();
            }
        }
        closeProgress();
    }

    function releaseBlobs() {
        if (!CR) {
            return;
        }
        for (var i = 0; i < CR.props.imgList.length; i++) {
            var img = CR.props.imgList[i];
            if (img.src && img.src.indexOf("blob:") === 0) {
                URL.revokeObjectURL(img.src);
            }
        }
    }

    function exitReader() {
        // 取消还在后台渲染的线程
        if (activeJob) {
            activeJob.cancelled = true;
            if (activeJob.abortController) {
                activeJob.abortController.abort();
            }
        }
        // 确保进度弹窗彻底关闭（class + inline 双保险）
        closeProgress();
        var overlay = gid("progress-overlay");
        if (overlay) {
            overlay.classList.remove("active", "error");
            overlay.style.display = "none";
        }
        if (CR) {
            CR.setProps("show", false);
            releaseBlobs();
            CR.setProps("imgList", []);
        }
        gid("reader-exit").classList.remove("show");
        document.title = PAGE_TITLE;
    }

    function clearReaderCache() {
        try {
            localStorage.removeItem("@Option");
            localStorage.removeItem("@Version");
            localStorage.removeItem("@Hotkeys");
        } catch (err) {
            return;
        }
        var button = gid("clearCacheBtn");
        var text = button.textContent;
        button.textContent = "已重置";
        window.setTimeout(function () {
            button.textContent = text;
        }, 1200);
    }

    function isTextEntryTarget(target) {
        if (!target || !target.tagName) {
            return false;
        }
        var tag = target.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function isReaderVisible() {
        return gid("reader-exit").classList.contains("show");
    }

    function isToolDialogVisible() {
        return !!(window.ToolUI && window.ToolUI.isDialogVisible());
    }

    function isTagDialogVisible() {
        return window.TagUI && window.TagUI.isDialogVisible();
    }

    function isShortcutHelpVisible() {
        return gid("shortcutHelp").style.display === "flex";
    }

    function setShortcutHelp(open) {
        gid("shortcutHelp").style.display = open ? "flex" : "none";
    }

    function toggleShortcutHelp() {
        setShortcutHelp(!isShortcutHelpVisible());
    }

    async function shutdownServer() {
        var button = gid("shutdownServerBtn");
        if (!button) {
            return;
        }
        button.disabled = true;
        button.textContent = "正在关闭...";
        try {
            var response = await fetch(CONFIG.shutdownPath || "/__shutdown", {
                method: "POST",
                headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
            });
            if (!response.ok) {
                throw Error("HTTP " + response.status);
            }
            button.textContent = "已关闭";
        } catch (err) {
            button.disabled = false;
            button.textContent = "关闭服务";
            setProgressError("关闭服务失败: " + err.message);
        }
    }

    async function refreshCatalog() {
        var button = gid("refreshCatalogBtn");
        if (!button) {
            return;
        }
        button.disabled = true;
        button.textContent = "刷新中...";
        try {
            var response = await fetch(CONFIG.refreshPath || "/__refresh", {
                method: "POST",
                headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
            });
            var body = await response.json().catch(function () { return {}; });
            if (!response.ok) {
                throw Error(body.message || "HTTP " + response.status);
            }
            button.textContent = "已更新";
            window.setTimeout(function () {
                location.reload();
            }, 250);
        } catch (err) {
            button.disabled = false;
            button.textContent = "刷新目录";
            setProgressError("刷新目录失败: " + err.message);
        }
    }

    async function readResponseMessage(response, fallback) {
        var message = fallback || ("HTTP " + response.status);
        try {
            var body = await response.clone().json();
            if (body && body.message) {
                message = body.message;
            }
        } catch (err) {
            try {
                var text = await response.text();
                if (text) {
                    message = text;
                }
            } catch (textErr) {}
        }
        return message;
    }

    async function postControlJson(path, body) {
        var response = await fetch(path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-ComicReader-Token": CONFIG.shutdownToken || "",
            },
            body: JSON.stringify(body || {}),
        });
        if (!response.ok) {
            throw Error(await readResponseMessage(response));
        }
        return response.json().catch(function () { return {}; });
    }

    async function openNativePdf(card) {
        if (!CONFIG.nativeOpenEnabled) {
            setProgressError(
                "Preview 打开需要通过 --serve 启动本地服务",
                "Preview 打开失败",
            );
            return;
        }
        if (activeJob) {
            activeJob.cancelled = true;
            if (activeJob.abortController) {
                activeJob.abortController.abort();
            }
            activeJob = null;
        }
        closeProgress();
        clearProgressError();
        try {
            var pdfUrl = new URL(card.dataset.pdf || "", location.href);
            var pdfPath = pdfUrl.pathname.replace(/^\/+/, "");
            try {
                pdfPath = decodeURIComponent(pdfPath);
            } catch (decodeErr) {
                pdfPath = pdfUrl.pathname.replace(/^\/+/, "");
            }
            var response = await fetch(
                CONFIG.nativeOpenPath || "/__open_native",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-ComicReader-Token": CONFIG.shutdownToken || "",
                    },
                    body: JSON.stringify({ pdf: pdfPath }),
                },
            );
            if (!response.ok) {
                var message = "HTTP " + response.status;
                try {
                    var data = await response.json();
                    if (data && data.message) {
                        message = data.message;
                    }
                } catch (err) {
                    message = "HTTP " + response.status;
                }
                throw Error(message);
            }
        } catch (err) {
            setProgressError(
                "Preview 打开失败: " + err.message,
                "Preview 打开失败",
            );
        }
    }

    async function ensureComicReader() {
        if (window.ComicReadScript) {
            return;
        }
        await loadScript(UMD_PATH);
    }

    async function ensurePdfJs() {
        if (PDF) {
            return PDF;
        }
        try {
            var localPdf = new URL(PDFJS_LOCAL_PATH, location.href).href;
            var localWorker = new URL(PDFJS_WORKER_PATH, location.href).href;
            PDF = await import(localPdf);
            PDF.GlobalWorkerOptions.workerSrc = localWorker;
            return PDF;
        } catch (localErr) {
            throw Error("加载本地 pdf.js 失败, 请重新运行 catalog.py 生成缓存");
        }
    }

    async function renderPdf(pdfUrl, title) {
        var job = { cancelled: false, abortController: new AbortController() };
        activeJob = job;
        showProgress(true, "正在加载 PDF...");
        clearProgressError();
        setProgress(0);

        var perfEnabled = Boolean(CONFIG.enablePerf);
        var perf = { start: performance.now() };

        try {
            await Promise.all([ensurePdfJs(), ensureComicReader()]);
        } catch (err) {
            setProgressError("加载依赖失败: " + err.message);
            return null;
        }

        var pdf;
        try {
            var useUrl = CONFIG.rangeSupport === true;

            if (useUrl) {
                // Let pdf.js perform range requests and streaming
                perf.fetchEnd = performance.now();
                try {
                    pdf = await PDF.getDocument({ url: pdfUrl, signal: job.abortController.signal }).promise;
                } catch (rangeErr) {
                    // Fallback to full download if range request fails
                    console.warn("Range request failed, falling back to full download:", rangeErr);
                    var response = await fetch(pdfUrl, { signal: job.abortController.signal });
                    if (!response.ok) {
                        throw Error("HTTP " + response.status);
                    }
                    var arrayBuffer = await response.arrayBuffer();
                    pdf = await PDF.getDocument({ data: arrayBuffer }).promise;
                }
                perf.parseEnd = performance.now();
            } else {
                var response = await fetch(pdfUrl, { signal: job.abortController.signal });
                if (!response.ok) {
                    throw Error("HTTP " + response.status);
                }
                perf.fetchEnd = performance.now();
                var arrayBuffer = await response.arrayBuffer();
                perf.arrayBufferEnd = performance.now();
                pdf = await PDF.getDocument({ data: arrayBuffer }).promise;
                perf.parseEnd = performance.now();
            }
        } catch (err) {
            if (!job.cancelled) {
                setProgressError("加载 PDF 失败: " + err.message);
            }
            return null;
        }

        if (job.cancelled) {
            return null;
        }

        var pageCount = pdf.numPages;
        gid("progress-title").textContent =
            "正在渲染 " + title + "（共 " + pageCount + " 页）";
        setProgress(0.05);

        var pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.pixelRatio || 2);
        var pageWidth = document.body.clientWidth;
        var imgs = new Array(pageCount);
        var errors = [];
        var index = 0;
        var completed = 0;

        var INITIAL_COUNT = Math.max(1, Math.min(pageCount, CONFIG.initialRenderPages || 3));
        var openedReader = false;
        var lastUpdatedCount = 0;

        async function renderOne(pageIndex) {
            try {
                var t0 = perfEnabled ? performance.now() : 0;
                var page = await pdf.getPage(pageIndex + 1);
                var view = page.view;
                var scale = view[2] < pageWidth ? pageWidth / view[2] : 1;
                var viewport = page.getViewport({ scale: scale });
                var canvas = document.createElement("canvas");
                canvas.width = Math.floor(viewport.width * pixelRatio);
                canvas.height = Math.floor(viewport.height * pixelRatio);
                await page.render({
                    canvasContext: canvas.getContext("2d"),
                    viewport: viewport,
                    transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
                }).promise;
                var blob = await new Promise(function (resolve) {
                    canvas.toBlob(resolve, "image/jpeg", 0.92);
                });
                canvas.width = 0;
                canvas.height = 0;
                if (!blob) {
                    throw Error("空白渲染结果");
                }
                imgs[pageIndex] = {
                    name: String(pageIndex + 1),
                    src: URL.createObjectURL(blob),
                };
                if (perfEnabled) {
                    perf["page_" + (pageIndex + 1)] = (performance.now() - t0);
                }
            } catch (err) {
                errors.push("第" + (pageIndex + 1) + "页: " + err.message);
                imgs[pageIndex] = { name: String(pageIndex + 1), src: "" };
            }
        }

        async function worker() {
            while (!job.cancelled) {
                var pageIndex = index++;
                if (pageIndex >= pageCount) {
                    break;
                }
                await renderOne(pageIndex);
                // 每次渲染后立即检查取消，避免在已退出后继续操作
                if (job.cancelled) {
                    break;
                }
                completed += 1;
                setProgress(0.05 + 0.94 * (completed / pageCount));

                // 当首批页渲染完成时，立即打开阅读器以减少首次可见延迟
                if (!openedReader && completed >= INITIAL_COUNT) {
                    openedReader = true;
                    var initialImgs = imgs.slice(0, INITIAL_COUNT).filter(function (i) { return i && i.src; });
                    if (initialImgs.length) {
                        if (!CR) {
                            CR = ComicReadScript.initComicReader({
                                polyfill: { GM: { getValue: lsGet, setValue: lsSet } },
                                props: {
                                    option: lsGet("@Option", {}),
                                    onOptionChange: function (option) {
                                        lsSet("@Option", option);
                                    },
                                    onExit: exitReader,
                                },
                            });
                        }
                        CR.open(initialImgs, title);
                        gid("reader-exit").classList.add("show");
                        document.title = title + " - ComicRead";
                        closeProgress();
                    }
                }

                // 若阅读器已展示，增量更新 imgList（仅当有新页完成时）
                if (openedReader && CR) {
                    try {
                        var currentImgs = imgs.filter(function (i) { return i && i.src; });
                        if (currentImgs.length > lastUpdatedCount) {
                            lastUpdatedCount = currentImgs.length;
                            CR.setProps("imgList", currentImgs);
                        }
                    } catch (e) {}
                }
            }
        }

        var workers = [];
        for (var i = 0; i < Math.min(RENDER_CONCURRENCY, pageCount); i++) {
            workers.push(worker());
        }
        await Promise.all(workers);

        if (job.cancelled) {
            releaseBlobList(imgs);
            activeJob = null;
            return null;
        }
        if (errors.length) {
            setProgressError(
                "部分页面渲染失败:\n" + errors.slice(0, 5).join("\n"),
            );
        }

        activeJob = null;

        // 性能统计（console）
        if (perfEnabled) {
            perf.end = performance.now();
            var fetchMs = Math.round((perf.arrayBufferEnd || perf.fetchEnd) - perf.start);
            var parseMs = Math.round((perf.parseEnd || perf.arrayBufferEnd) - (perf.arrayBufferEnd || perf.fetchEnd));
            var renderMs = Math.round(perf.end - (perf.parseEnd || perf.start));
            var avgPage = Math.round(renderMs / Math.max(1, pageCount));
            console.debug("perf: fetch=%dms parse=%dms render=%dms avgPage=%dms", fetchMs, parseMs, renderMs, avgPage);
        }

        return imgs.filter(function (img) {
            return img.src;
        });
    }

    function releaseBlobList(imgs) {
        imgs.forEach(function (img) {
            if (img && img.src && img.src.indexOf("blob:") === 0) {
                URL.revokeObjectURL(img.src);
            }
        });
    }

    async function readPdf(card) {
        var title = card.querySelector(".card-title").textContent.trim();
        var url = new URL(card.dataset.pdf, location.href).href;

        // 取消前一个渲染任务
        if (activeJob) {
            activeJob.cancelled = true;
            if (activeJob.abortController) {
                activeJob.abortController.abort();
            }
        }

        card.classList.add("loading");
        try {
            if (CR) {
                releaseBlobs();
            }
            var imgs = await renderPdf(url, title);
            if (!imgs || !imgs.length) {
                if (
                    !gid("progress-error").classList.contains("show") &&
                    activeJob &&
                    !activeJob.cancelled
                ) {
                    setProgressError("未能渲染任何页面");
                }
                return;
            }

            // 阅读器已由 worker 提前打开，不再重复打开
            if (gid("reader-exit").classList.contains("show")) {
                return;
            }

            if (!CR) {
                CR = ComicReadScript.initComicReader({
                    polyfill: { GM: { getValue: lsGet, setValue: lsSet } },
                    props: {
                        option: lsGet("@Option", {}),
                        onOptionChange: function (option) {
                            lsSet("@Option", option);
                        },
                        onExit: exitReader,
                    },
                });
            }
            CR.open(imgs, title);
            gid("reader-exit").classList.add("show");
            document.title = title + " - ComicRead";
            closeProgress();
        } finally {
            card.classList.remove("loading");
        }
    }

    function closeRestartDialog() {
        gid("restartDialog").style.display = "none";
        gid("restartConfirm").focus();
    }

    function closeRestartProgressDialog() {
        gid("restartProgressDialog").style.display = "none";
    }

    function bindEvents() {
        bindClick("sidebarToggle", toggleSidebar);
        bindClick("sidebarCollapse", toggleSidebar);
        var searchInput = gid("searchInput");
        if (searchInput) {
            searchInput.addEventListener("input", function (event) {
                filterTree(event.target.value);
                if (window.TagUI) {
                    window.TagUI.renderSidebarTags();
                }
            });
            searchInput.addEventListener("keydown", function (event) {
                if (event.key === "Escape") {
                    this.blur();
                }
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
        bindClick("openRootBtn", async function () {
            if (window.ToolUI) {
                await window.ToolUI.openFolder("", gid("openRootBtn"), "library");
            }
        });
        bindClick("clearCacheBtn", clearReaderCache);
        bindClick("shutdownServerBtn", shutdownServer);
        bindClick("restartServerBtn", function () {
            // 显示重启确认对话框
            gid("restartDialog").style.display = "flex";
        });

        // 重启确认对话框逻辑
        var restartDialog = gid("restartDialog");
        var restartProgressDialog = gid("restartProgressDialog");

        bindClick("restartCancel", closeRestartDialog);
        bindClick("restartDialogBackdrop", closeRestartDialog);

        bindClick("restartConfirm", async function () {
            // 关闭确认对话框
            restartDialog.style.display = "none";
            // 显示重启进度对话框
            restartProgressDialog.style.display = "flex";

            try {
                var response = await fetch(CONFIG.restartPath || "/__restart", {
                    method: "POST",
                    headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
                });
                if (!response.ok) {
                    throw Error(await readResponseMessage(response));
                }
            } catch (err) {
                restartProgressDialog.style.display = "none";
                setProgressError("重启服务失败: " + err.message);
                return;
            }
            // 轮询等待服务恢复，用时间戳参数绕过浏览器缓存
            function poll() {
                var ts = Date.now();
                // 轮询请求带时间戳绕过浏览器缓存，确认服务已恢复
                fetch(location.href.split("?")[0] + "?_t=" + ts).then(function () {
                    // 导航回原始干净 URL，同一标签页替换旧页面
                    location.replace(location.href.split("?")[0]);
                }).catch(function () { setTimeout(poll, 1000); });
            }
            setTimeout(poll, 2000);
        });
        // 下拉菜单交互
        function closeAllDropdowns() {
            document.querySelectorAll('.dropdown-menu.show').forEach(function(menu) {
                menu.classList.remove('show');
            });
            document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(function(toggle) {
                toggle.setAttribute('aria-expanded', 'false');
            });
        }

        function toggleDropdown(btn) {
            var container = btn.closest('.dropdown');
            if (!container) return;
            var menu = container.querySelector('.dropdown-menu');
            if (!menu) return;
            var isOpen = menu.classList.contains('show');
            closeAllDropdowns();
            if (!isOpen) {
                menu.classList.add('show');
                btn.setAttribute('aria-expanded', 'true');
            }
        }

        // 使用事件委托绑定工具栏所有下拉按钮
        var toolbar = document.querySelector('.toolbar');
        if (toolbar) {
            toolbar.addEventListener('click', function(e) {
                var toggleBtn = e.target.closest('.dropdown-toggle');
                if (toggleBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleDropdown(toggleBtn);
                    return;
                }
                var dropdownItem = e.target.closest('.dropdown-item');
                if (dropdownItem) {
                    e.stopPropagation();
                    var toolId = dropdownItem.dataset.tool;
                    if (toolId) {
                        if (window.ToolUI) window.ToolUI.openDialog(toolId);
                    }
                    closeAllDropdowns();
                    return;
                }
            });
        }

        // 点击页面其他地方关闭下拉菜单
        document.addEventListener('click', function(e) {
            if (e.target.closest('.toolbar')) return;
            closeAllDropdowns();
        });
        
        // 最小化进度窗口
        bindClick("progressMinimize", function() {
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

        // 快捷键帮助
        bindClick("shortcutHelpClose", function () {
            setShortcutHelp(false);
        });
        // 点击页面空白处（卡片外部）关闭
        var helpPage = document.querySelector("#shortcutHelp .shortcut-help-page");
        if (helpPage) {
            helpPage.addEventListener("click", function (event) {
                if (!event.target.closest(".shortcut-help-card")) setShortcutHelp(false);
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
        // 卡片点击: 根据 VIEW_MODE 选择打开方式
        document.querySelectorAll(".card-cover").forEach(function (cover) {
            cover.addEventListener("click", function () {
                var card = cover.closest(".card");
                if (VIEW_MODE === "native") {
                    openNativePdf(card);
                } else {
                    readPdf(card);
                }
            });
        });
    }

    function handleGlobalShortcut(event) {
        if (isTextEntryTarget(event.target) || isReaderVisible()) {
            return;
        }
        // 按住 Cmd / Ctrl 时不拦截，放行浏览器原生快捷键
        if (event.metaKey || event.ctrlKey) return;

        var key = event.key;

        // 检查重启确认对话框
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

        // 检查重启进度对话框
        if (gid("restartProgressDialog").style.display === "flex") {
            if (key === "Escape") {
                // 重启进行中，不允许关闭，只提示用户
                return;
            }
            return;
        }

        if (key === "Escape") {
            if (isShortcutHelpVisible()) {
                setShortcutHelp(false);
                event.preventDefault();
                return;
            }
            if (isTagDialogVisible()) {
                if (window.TagUI) window.TagUI.closeDialog();
                event.preventDefault();
                return;
            }
            if (isToolDialogVisible()) {
                if (window.ToolUI) window.ToolUI.closeDialog();
                event.preventDefault();
            }
            return;
        }

        if (key === "?") {
            event.preventDefault();
            toggleShortcutHelp();
            return;
        }

        if (isTagDialogVisible()) {
            if (key === "Enter" && document.activeElement && document.activeElement.id !== "tagAddInput") {
                event.preventDefault();
                if (window.TagUI) window.TagUI.saveDialog();
            }
            return;
        }

        if (isShortcutHelpVisible() || isToolDialogVisible()) {
            return;
        }

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

        if ((key === "x" || key === "y" || key === "z") && CONFIG.serverControl) {
            if (isToolDialogVisible()) return;
            event.preventDefault();
            if (window.ToolUI) window.ToolUI.openDialog(key);
            return;
        }

        if (key === "t" || key === "T") {
            event.preventDefault();
            if (window.TagUI) window.TagUI.openDialogForHighlightedCard();
            return;
        }
    }

    function initState() {
        var saved = lsGet(SIDEBAR_STATE, "");
        if (isMobile() || saved === "collapsed") {
            setSidebar(false);
        }
        var sort = lsGet("@catalogSort", "name");
        if (sort !== "time") {
            sort = "name";
        }
        gid("sortSelect").value = sort;
        if (sort === "name") {
            sortByName();
        } else {
            sortByTime();
        }
        allCollapsed = true;
        setNodeExpandedRecursive(TREE, false);
        updateAllCollapsedFromHeaders();
    }

    window.CatalogApp = {
        config: CONFIG,
        tree: TREE,
        gid: gid,
        bindClick: bindClick,
        lsGet: lsGet,
        lsSet: lsSet,
        filterTree: filterTree,
        setProgressError: setProgressError,
        readResponseMessage: readResponseMessage,
        postControlJson: postControlJson,
        setActiveJob: function (job) {
            activeJob = job;
        },
        getActiveJob: function () {
            return activeJob;
        },
    };

    document.addEventListener("DOMContentLoaded", function () {
        initTheme();
        initSidebarResize();
        renderTree();
        bindEvents();
        initState();
        updateViewModeBtn();
        if (window.TagUI) {
            window.TagUI.init();
        }
        if (window.ToolUI) {
            window.ToolUI.init();
        }
        document.addEventListener("keydown", handleGlobalShortcut);
    });
})();

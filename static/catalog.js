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
    var VIEW_MODE = lsGet("@viewMode", "reader");

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

    function toggleViewMode() {
        if (!CONFIG.nativeOpenEnabled) {
            return;
        }
        VIEW_MODE = VIEW_MODE === "reader" ? "native" : "reader";
        lsSet("@viewMode", VIEW_MODE);
        updateViewModeBtn();
    }

    function gid(id) {
        return document.getElementById(id);
    }

    function bindClick(id, handler) {
        var element = gid(id);
        if (element) {
            element.addEventListener("click", handler);
        }
    }

    function isMobile() {
        return window.matchMedia("(max-width: 768px)").matches;
    }

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

    function lsGet(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (err) {
            return localStorage.getItem(key) || fallback;
        }
    }

    function lsSet(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function applySidebarWidth(width) {
        var safeWidth = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        document.documentElement.style.setProperty(
            "--sidebar-width",
            safeWidth + "px",
        );
        return safeWidth;
    }

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
            header.scrollIntoView({ behavior: "smooth", block: "start" });
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
            card.scrollIntoView({ behavior: "smooth", block: "start" });
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
        var q = query.trim().toLowerCase();
        if (!q) {
            renderTree();
            updateFoldToggleButton();
            document.querySelectorAll(".card").forEach(function (card) {
                card.style.display = "";
            });
            document.querySelectorAll(".folder-header.collapsed").forEach(function (h) {
                h.classList.remove("collapsed");
            });
            return;
        }
        var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "$&"), "i");
        document
            .querySelectorAll(".tree-row:not(.folder)")
            .forEach(function (row) {
                row.style.display = re.test(row.textContent) ? "" : "none";
            });
        document
            .querySelectorAll(".tree-children")
            .forEach(function (children) {
                children.classList.remove("collapsed");
                children.style.maxHeight = "none";
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
            });

        // 过滤卡片网格
        document.querySelectorAll(".card").forEach(function (card) {
            var title = (card.dataset.title || "").toLowerCase();
            card.style.display = title.includes(q) ? "" : "none";
        });
        document.querySelectorAll(".folder-header.collapsed").forEach(function (h) {
            h.classList.remove("collapsed");
        });
        // 隐藏空的分组
        document.querySelectorAll(".folder-group").forEach(function (group) {
            var hasVisible = Array.from(group.querySelectorAll(".card")).some(function (c) {
                return c.style.display !== "none";
            });
            group.style.display = hasVisible ? "" : "none";
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
        return gid("toolDialog").style.display === "flex";
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

    function getToolOpenPath() {
        if (CONFIG.toolOpenPath) {
            return CONFIG.toolOpenPath;
        }
        return CONFIG.toolRunPath
            ? CONFIG.toolRunPath.replace("tool_run", "tool_open")
            : "/__tool_open";
    }

    async function openToolFolder(folder, button) {
        var originalText = button ? button.textContent : "";
        if (button) {
            button.disabled = true;
            button.textContent = "打开中...";
        }
        try {
            await postControlJson(getToolOpenPath(), { folder: folder || "" });
            if (button) {
                button.textContent = "已打开";
                window.setTimeout(function () {
                    button.disabled = false;
                    button.textContent = originalText;
                }, 1000);
            }
        } catch (err) {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
            setProgressError("打开目录失败: " + err.message);
        }
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
                pdf = await PDF.getDocument({ url: pdfUrl, signal: job.abortController.signal }).promise;
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

        var pixelRatio = Math.min(window.devicePixelRatio || 1, 1);
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
                    canvas.toBlob(resolve, "image/jpeg", 0.85);
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

    // ============================================================
    // 文件管理工具系统
    // ============================================================

    var activeTool = null;
    var toolRunning = false;

    var TOOL_INFO = {
        x: {
            name: "PDF尺寸缩放",
            desc: "对选中目录中的所有 PDF 文件统一页面尺寸，原文件备份到 x_backup",
            color: "#edf4ff",
        },
        y: {
            name: "PDF页面裁剪",
            desc: "对选中目录中的所有 PDF 文件删除指定页面，原文件备份到 y_backup",
            color: "#edf4ff",
        },
        z: {
            name: "ZIP转PDF",
            desc: "对选中目录中的所有 ZIP 压缩包解压并合成为 PDF",
            color: "#edf4ff",
        },
    };

    var TOOL_FORMS = {
        x: function () {
            return '\
            <div class="form-row">\
                <label>尺寸预设</label>\
                <div class="radio-group">\
                    <label class="radio-label">\
                        <input type="radio" name="sizePreset" value="a4" id="toolParamPresetA4" checked>\
                        A4 标准 (210×297mm)\
                    </label>\
                    <label class="radio-label">\
                        <input type="radio" name="sizePreset" value="custom" id="toolParamPresetCustom">\
                        自定义\
                    </label>\
                </div>\
            </div>\
            <div class="form-row-inline">\
                <label>目标宽度</label>\
                <input type="number" class="form-input" id="toolParamWidth" value="210" min="10" max="999" step="1">\
                <span class="form-unit">mm</span>\
            </div>\
            <div class="form-row-inline" id="toolParamHeightRow">\
                <label>目标高度</label>\
                <input type="number" class="form-input" id="toolParamHeight" value="297" min="10" max="999" step="1">\
                <span class="form-unit">mm</span>\
            </div>\
            <div class="form-row">\
                <label class="checkbox-label">\
                    <input type="checkbox" id="toolParamStrip">\
                    条形漫画模式 <span class="form-note">（仅固定宽度，高度自适应）</span>\
                </label>\
            </div>';
        },
        y: function () {
            var html =
                '\
            <div class="form-row">\
                <label>删除方式</label>\
                <select class="form-select" id="toolParamMode">\
                    <option value="single">删除指定单页</option>\
                    <option value="range">删除连续多页</option>\
                </select>\
            </div>\
            <div class="form-row" id="toolParamSingleRow">\
                <label>页码 <span class="form-note">从 1 开始算</span></label>\
                <input type="number" class="form-input" id="toolParamSingle" value="1" min="1" step="1">\
            </div>\
            <div class="form-row" id="toolParamRangeRow" style="display:none">\
                <label>连续页数</label>\
                <input type="number" class="form-input" id="toolParamRange" value="1" min="1" step="1">\
            </div>\
            <div class="form-row">\
                <label class="checkbox-label">\
                    <input type="checkbox" id="toolParamBack">\
                    从后往前数\
                </label>\
            </div>';
            return html;
        },
        z: function () {
            return '\
            <div class="form-row">\
                <div class="form-info-block">\
                    扫描选中目录中的所有 <code>.zip</code> 文件，逐一解压、检查图片有效性，\
                    然后使用 ImageMagick 合成为同名的 <code>.pdf</code> 文件。<br><br>\
                    无需额外参数，点击「执行」开始处理。\
                </div>\
            </div>';
        },
    };

    function cleanToolOutput(text) {
        return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    function collectFolders(nodes, result) {
        nodes.forEach(function (node) {
            if (
                node.type === "dir" &&
                node.folder &&
                result.indexOf(node.folder) === -1
            ) {
                result.push(node.folder);
            }
            if (node.children && node.children.length) {
                collectFolders(node.children, result);
            }
        });
    }

    function populateFolderSelect() {
        var select = gid("toolFolderSelect");
        select.innerHTML = "";
        var folders = [""];
        collectFolders(TREE, folders);
        // 默认加入临时处理目录（始终位于列表顶部）
        if (folders.indexOf("temp") === -1) {
            folders.unshift("temp");
        }
        folders.sort(function (a, b) {
            if (a === "temp") return -1;
            if (b === "temp") return 1;
            if (!a) return -1;
            if (!b) return 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });
        var tempAdded = false;
        folders.forEach(function (f) {
            var opt = document.createElement("option");
            opt.value = f;
            if (f === "temp") {
                opt.textContent = "📂 temp/ (临时处理目录)";
                opt.selected = true;
                tempAdded = true;
            } else {
                opt.textContent = f ? f : "📂 / (根目录 — 处理所有 PDF)";
            }
            select.appendChild(opt);
        });
        // 确保 temp 被选中（即使 temp 不存在于文件夹列表）
        if (!tempAdded) {
            var tempOpt = document.createElement("option");
            tempOpt.value = "temp";
            tempOpt.textContent = "📂 temp/ (临时处理目录)";
            tempOpt.selected = true;
            select.insertBefore(tempOpt, select.firstChild);
        }
    }

    function buildToolForm(tool) {
        var form = gid("toolParamsForm");
        var builder = TOOL_FORMS[tool];
        if (builder) {
            form.innerHTML = builder();
        } else {
            form.innerHTML =
                "<p style='color:var(--muted);font-size:13px;'>该工具无需额外参数。</p>";
        }

        // ---- 通用：所有数字输入框实时规范化 ----
        form.querySelectorAll('input[type="number"]').forEach(function (input) {
            // 实时拦截非法字符——利用浏览器原生 validity.badInput
            input.addEventListener("input", function () {
                if (this.validity.badInput) {
                    var prev = this.getAttribute("data-prev");
                    if (prev !== null) this.value = prev;
                } else {
                    this.setAttribute("data-prev", this.value);
                }
            });
            // 离开时自动钳位到 [min, max]
            input.addEventListener("blur", function () {
                if (this.value === "") return;
                var val = parseInt(this.value, 10);
                if (isNaN(val)) {
                    this.value = this.getAttribute("data-prev") || "";
                    return;
                }
                var min = parseFloat(this.min);
                var max = parseFloat(this.max);
                if (!isNaN(min) && val < min) this.value = min;
                if (!isNaN(max) && val > max) this.value = max;
                this.setAttribute("data-prev", this.value);
            });
        });

        // ---- x 工具：A4 预设 + 条形模式联动 ----
        if (tool === "x") {
            var updating = false;
            var presetA4 = gid("toolParamPresetA4");
            var presetCustom = gid("toolParamPresetCustom");
            var wInput = gid("toolParamWidth");
            var hInput = gid("toolParamHeight");
            var stripCheck = gid("toolParamStrip");
            var heightRow = gid("toolParamHeightRow");

            function setInputStates() {
                var isStrip = stripCheck.checked;
                var isA4 = presetA4.checked;
                // 条形模式：高度自适应，禁止输入（保留行避免界面跳动）
                hInput.disabled = isStrip || isA4;
                wInput.disabled = isA4;
                // 条形模式下高度标签加辅助提示
                //                var hLabel = heightRow && heightRow.querySelector("label");
                //                if (hLabel) {
                //                    var note = hLabel.querySelector(".form-note");
                //                    if (isStrip) {
                //                        if (!note) {
                //                            note = document.createElement("span");
                //                            note.className = "form-note";
                //                            hLabel.appendChild(note);
                //                        }
                //                        note.textContent = "（自适应）";
                //                    } else if (note) {
                //                        note.textContent = "";
                //                    }
                //                }
            }

            function applyPreset() {
                updating = true;
                if (presetA4.checked) {
                    wInput.value = 210;
                    hInput.value = 297;
                }
                updating = false;
                setInputStates();
            }

            function onManualChange() {
                if (updating) return;
                // 用户手动修改数值时自动切换到「自定义」
                if (presetA4.checked) {
                    presetA4.checked = false;
                    presetCustom.checked = true;
                }
                setInputStates();
            }

            if (presetA4) presetA4.addEventListener("change", applyPreset);
            if (presetCustom)
                presetCustom.addEventListener("change", applyPreset);
            if (wInput) wInput.addEventListener("input", onManualChange);
            if (hInput) hInput.addEventListener("input", onManualChange);
            if (stripCheck)
                stripCheck.addEventListener("change", setInputStates);

            applyPreset();
        }

        // ---- y 工具：模式切换 ----
        if (tool === "y") {
            var modeEl = gid("toolParamMode");
            if (modeEl) {
                modeEl.addEventListener("change", function () {
                    var isSingle = this.value === "single";
                    var singleRow = gid("toolParamSingleRow");
                    var rangeRow = gid("toolParamRangeRow");
                    if (singleRow)
                        singleRow.style.display = isSingle ? "" : "none";
                    if (rangeRow)
                        rangeRow.style.display = isSingle ? "none" : "";
                });
            }
        }
    }

    function openToolDialog(tool) {
        activeTool = tool;
        var info = TOOL_INFO[tool] || { name: "未知工具", desc: "" };
        gid("toolDialogTitle").textContent = info.name;
        gid("toolDialogDesc").textContent = info.desc;
        // 重置输出区域
        gid("toolOutputWrap").style.display = "none";
        gid("toolResultOutput").textContent = "";
        // 重置参数表单
        gid("toolParamsForm").innerHTML = "";
        // 重置按钮
        gid("toolDialogRun").disabled = false;
        gid("toolDialogRun").textContent = "执行";
        // 显示对话框
        gid("toolDialog").style.display = "flex";
        populateFolderSelect();
        buildToolForm(tool);
        // 自动聚焦到执行按钮
        setTimeout(function () {
            gid("toolDialogRun").focus();
        }, 300);
    }

    function closeToolDialog() {
        gid("toolDialog").style.display = "none";
        activeTool = null;
    }

    function gatherToolParams(tool) {
        var params = {};
        if (tool === "x") {
            var w = parseFloat(gid("toolParamWidth").value);
            var isStrip = gid("toolParamStrip").checked;
            var h = parseFloat(gid("toolParamHeight").value);
            if (!w || w < 10) {
                setProgressError("宽度不能小于 10mm");
                return null;
            }
            if (!isStrip && (!h || h < 10)) {
                setProgressError("高度不能小于 10mm");
                return null;
            }
            params.width = w;
            params.height = isStrip ? 297 : h;
            params.strip = isStrip;
        } else if (tool === "y") {
            var mode = gid("toolParamMode").value;
            if (mode === "single") {
                var s = parseInt(gid("toolParamSingle").value);
                if (!s || s < 1) {
                    setProgressError("页码必须大于 0");
                    return null;
                }
                params.single = s;
            } else {
                var r = parseInt(gid("toolParamRange").value);
                if (!r || r < 1) {
                    setProgressError("页数必须大于 0");
                    return null;
                }
                params.range = r;
            }
            params.back = gid("toolParamBack").checked;
        }
        return params;
    }

    async function runTool() {
        if (toolRunning) return;
        if (!activeTool) return;

        var params = gatherToolParams(activeTool);
        if (!params) return;

        var folder = gid("toolFolderSelect").value;
        var info = TOOL_INFO[activeTool] || { name: "工具" };

        toolRunning = true;
        // 禁用操作按钮
        gid("toolDialogRun").disabled = true;
        gid("toolDialogRun").textContent = "执行中...";
        gid("toolDialogCancel").disabled = true;
        gid("toolDialogCancel").textContent = "关闭";
        // 准备输出区域
        var outputEl = gid("toolResultOutput");
        outputEl.textContent = "";
        gid("toolOutputWrap").style.display = "block";
        // 确保输出区域可见
        setTimeout(function () {
            gid("toolOutputWrap").scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }, 50);

        try {
            var startTime = Date.now();
            var abortController = new AbortController();
            activeJob = {
                cancelled: false,
                abortController: abortController,
            };

            var response = await fetch(CONFIG.toolRunPath || "/__tool_run", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-ComicReader-Token": CONFIG.shutdownToken || "",
                },
                body: JSON.stringify({
                    tool: activeTool,
                    folder: folder,
                    params: params,
                }),
                signal: abortController.signal,
            });
            if (!response.ok) {
                throw Error(await readResponseMessage(response));
            }

            var accumulated = "";
            var result = null;
            var elapsed;

            // 流式读取 SSE 输出并实时追加到输出区域
            if (response.body) {
                var decoder = new TextDecoder();
                var reader = response.body.getReader();
                var buffer = "";

                while (true) {
                    var { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    var parts = buffer.split("\n");
                    buffer = parts.pop() || "";

                    for (var i = 0; i < parts.length; i++) {
                        var line = parts[i].trim();
                        if (line.startsWith("data: ")) {
                            var content = line.slice(6);
                            if (content.startsWith("__RESULT__:")) {
                                result = JSON.parse(content.slice(11));
                            } else {
                                accumulated += content + "\n";
                                outputEl.textContent = accumulated;
                                outputEl.scrollTop = outputEl.scrollHeight;
                            }
                        }
                    }
                }
            } else {
                // 兜底：整个读取
                var text = await response.text();
                var lines = text.split("\n");
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.startsWith("data: ")) {
                        var content = line.slice(6);
                        if (content.startsWith("__RESULT__:")) {
                            result = JSON.parse(content.slice(11));
                        } else {
                            accumulated += content + "\n";
                        }
                    }
                }
                outputEl.textContent = accumulated;
            }

            elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // 追加完成信息到输出区域
            if (result && result.ok) {
                accumulated +=
                    "\n✓ 操作完成，耗时 " + elapsed + " 秒，返回码 " + result.returncode + "\n";
            } else {
                accumulated +=
                    "\n✗ 操作失败，返回码 " +
                    ((result && result.returncode) != null ? result.returncode : "?") +
                    "\n";
            }
            outputEl.textContent = accumulated;
            outputEl.scrollTop = outputEl.scrollHeight;
        } catch (err) {
            if (err.name === "AbortError") {
                gid("toolResultOutput").textContent += "\n⏹ 操作已取消\n";
                return;
            }
            gid("toolResultOutput").textContent +=
                "\n✗ 请求失败: " + err.message + "\n";
        } finally {
            toolRunning = false;
            activeJob = null;
            gid("toolDialogRun").disabled = false;
            gid("toolDialogRun").textContent = "执行";
            gid("toolDialogCancel").disabled = false;
            gid("toolDialogCancel").textContent = "关闭";
        }
    }

    function bindEvents() {
        bindClick("sidebarToggle", toggleSidebar);
        bindClick("sidebarCollapse", toggleSidebar);
        var searchInput = gid("searchInput");
        if (searchInput) {
            searchInput.addEventListener("input", function (event) {
                filterTree(event.target.value);
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
            await openToolFolder("", gid("openRootBtn"));
        });
        bindClick("clearCacheBtn", clearReaderCache);
        bindClick("shutdownServerBtn", shutdownServer);
        bindClick("restartServerBtn", async function () {
            var btn = gid("restartServerBtn");
            btn.disabled = true;
            btn.textContent = "重启中...";
            try {
                var response = await fetch(CONFIG.restartPath || "/__restart", {
                    method: "POST",
                    headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
                });
                if (!response.ok) {
                    throw Error(await readResponseMessage(response));
                }
            } catch (err) {
                btn.disabled = false;
                btn.textContent = "重启服务";
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
        bindClick("shortcutHelpBtn", toggleShortcutHelp);
        bindClick("reader-exit", exitReader);
        bindClick("progressCancel", cancelProgress);
        bindClick("progressClose", closeProgress);

        // 工具按钮
        document
            .querySelectorAll(".tool-btn[data-tool]")
            .forEach(function (btn) {
                btn.addEventListener("click", function () {
                    openToolDialog(this.dataset.tool);
                });
            });

        // 工具对话框
        bindClick("toolDialogBackdrop", closeToolDialog);
        bindClick("toolDialogCancel", closeToolDialog);
        bindClick("toolDialogRun", runTool);

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

        // 复制输出内容
        bindClick("toolOutputCopy", function () {
            var text = gid("toolResultOutput").textContent;
            if (!text) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard
                    .writeText(text)
                    .then(function () {
                        gid("toolOutputCopy").textContent = "已复制";
                        setTimeout(function () {
                            gid("toolOutputCopy").textContent = "复制";
                        }, 1500);
                    })
                    .catch(function () {});
            }
        });

        // 打开目录
        bindClick("toolDialogOpen", async function () {
            var folder = gid("toolFolderSelect").value;
            await openToolFolder(folder, gid("toolDialogOpen"));
        });

        // 清理备份
        bindClick("toolDialogClean", async function () {
            if (!activeTool) return;
            var folder = gid("toolFolderSelect").value;
            var outputEl = gid("toolResultOutput");
            outputEl.textContent = "";
            gid("toolOutputWrap").style.display = "block";
            outputEl.textContent = "正在清理...\n";

            try {
                var response = await fetch(CONFIG.toolRunPath || "/__tool_run", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-ComicReader-Token": CONFIG.shutdownToken || "",
                    },
                    body: JSON.stringify({
                        tool: activeTool,
                        folder: folder,
                        params: { clean: true, open_after: false },
                    }),
                });
                if (!response.ok) {
                    throw Error(await readResponseMessage(response));
                }

                if (response.body) {
                    var decoder = new TextDecoder();
                    var reader = response.body.getReader();
                    var buffer = "";
                    var text = "";
                    while (true) {
                        var { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        var parts = buffer.split("\n");
                        buffer = parts.pop() || "";
                        for (var i = 0; i < parts.length; i++) {
                            var line = parts[i].trim();
                            if (line.startsWith("data: ")) {
                                var content = line.slice(6);
                                if (!content.startsWith("__RESULT__:")) {
                                    text += content + "\n";
                                    outputEl.textContent = text;
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                outputEl.textContent += "清除失败: " + err.message + "\n";
            }
        });

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

        if (key === "Escape") {
            if (isShortcutHelpVisible()) {
                setShortcutHelp(false);
                event.preventDefault();
                return;
            }
            if (isToolDialogVisible()) {
                closeToolDialog();
                event.preventDefault();
            }
            return;
        }

        if (key === "?") {
            event.preventDefault();
            toggleShortcutHelp();
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

        if ((key === "x" || key === "y" || key === "z") && CONFIG.serverControl) {
            if (isToolDialogVisible()) return;
            event.preventDefault();
            openToolDialog(key);
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

    document.addEventListener("DOMContentLoaded", function () {
        initSidebarResize();
        renderTree();
        bindEvents();
        initState();
        updateViewModeBtn();
        document.addEventListener("keydown", handleGlobalShortcut);
    });
})();

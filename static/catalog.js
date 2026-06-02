(function () {
    var CONFIG = window.CATALOG_CONFIG || {};
    var TREE = CONFIG.tree || [];
    var UMD_PATH = CONFIG.umdPath || "ComicReader.umd.js";
    var PDFJS_LOCAL_PATH = CONFIG.pdfjsLocalPath || "vendor/pdfjs/pdf.min.mjs";
    var PDFJS_WORKER_PATH = CONFIG.pdfjsWorkerPath || "vendor/pdfjs/pdf.worker.min.mjs";
    var RENDER_CONCURRENCY = CONFIG.renderConcurrency || 4;
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
        btn.textContent = VIEW_MODE === "native" ? "Preview 打开" : "网页阅读";
        btn.title = VIEW_MODE === "native" ? "点击卡片时使用 macOS Preview 打开 PDF" : "点击卡片时使用内置网页阅读器";
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
        document.documentElement.style.setProperty("--sidebar-width", safeWidth + "px");
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
        setSidebar(isMobile() ? !sidebar.classList.contains("open") : sidebar.classList.contains("collapsed"));
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
        return Array.from(document.querySelectorAll(".folder-header")).find(function (item) {
            return (item.dataset.folder || "") === (folder || "");
        });
    }

    function findTreePathByFolder(nodes, folder, path) {
        var normalized = folder || "";
        for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var nextPath = path.concat(node);
            if (node.children && node.children.length) {
                var childPath = findTreePathByFolder(node.children, normalized, nextPath);
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
        return Array.from(document.querySelectorAll(".tree-row.folder")).find(function (row) {
            var name = row.querySelector(".tree-name");
            return (row.dataset.folder || "") === normalized && name && name.textContent === node.name;
        });
    }

    function updateAllCollapsedFromHeaders() {
        allCollapsed = Array.from(document.querySelectorAll(".folder-header")).every(function (item) {
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
        var children = toggle.closest(".tree-node").querySelector(".tree-children");
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
                children.className = "tree-children" + (node.expanded ? "" : " collapsed");
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
        var node = document.querySelector('.tree-row[data-index="' + index + '"]');
        if (node) {
            document.querySelectorAll(".tree-row.active").forEach(function (row) {
                row.classList.remove("active");
            });
            node.classList.add("active");
            node.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
    }

    function filterTree(query) {
        var q = query.trim();
        if (!q) {
            renderTree();
            updateFoldToggleButton();
            return;
        }
        var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "$&"), "i");
        document.querySelectorAll(".tree-row:not(.folder)").forEach(function (row) {
            row.style.display = re.test(row.textContent) ? "" : "none";
        });
        document.querySelectorAll(".tree-children").forEach(function (children) {
            children.classList.remove("collapsed");
            children.style.maxHeight = "none";
        });
        Array.from(document.querySelectorAll(".tree-node")).reverse().forEach(function (node) {
            var row = node.firstElementChild;
            if (!row || !row.classList.contains("folder")) {
                return;
            }
            var hasMatch = Array.from(node.querySelectorAll(".tree-row:not(.folder)")).some(function (pdfRow) {
                return pdfRow.style.display !== "none";
            });
            row.style.display = hasMatch ? "" : "none";
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
            return a.dataset.title.localeCompare(b.dataset.title, undefined, { numeric: true });
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
            if (!response.ok) {
                throw Error("HTTP " + response.status);
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

    async function openNativePdf(card) {
        if (!CONFIG.nativeOpenEnabled) {
            setProgressError("Preview 打开需要通过 --serve 启动本地服务", "Preview 打开失败");
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
            var response = await fetch(CONFIG.nativeOpenPath || "/__open_native", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-ComicReader-Token": CONFIG.shutdownToken || "",
                },
                body: JSON.stringify({ pdf: pdfPath }),
            });
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
            setProgressError("Preview 打开失败: " + err.message, "Preview 打开失败");
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

        try {
            await Promise.all([ensurePdfJs(), ensureComicReader()]);
        } catch (err) {
            setProgressError("加载依赖失败: " + err.message);
            return null;
        }

        var pdf;
        try {
            var response = await fetch(pdfUrl, { signal: job.abortController.signal });
            if (!response.ok) {
                throw Error("HTTP " + response.status);
            }
            pdf = await PDF.getDocument({ data: await response.arrayBuffer() }).promise;
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
        gid("progress-title").textContent = "正在渲染 " + title + "（共 " + pageCount + " 页）";
        setProgress(0.05);

        var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        var pageWidth = document.body.clientWidth;
        var imgs = new Array(pageCount);
        var errors = [];
        var index = 0;
        var completed = 0;

        async function renderOne(pageIndex) {
            try {
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
                imgs[pageIndex] = { name: String(pageIndex + 1), src: URL.createObjectURL(blob) };
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
                completed += 1;
                setProgress(0.05 + 0.94 * (completed / pageCount));
            }
        }

        var workers = [];
        for (var i = 0; i < Math.min(RENDER_CONCURRENCY, pageCount); i++) {
            workers.push(worker());
        }
        await Promise.all(workers);

        if (job.cancelled) {
            releaseBlobList(imgs);
            return null;
        }
        if (errors.length) {
            setProgressError("部分页面渲染失败:\n" + errors.slice(0, 5).join("\n"));
        }
        activeJob = null;
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
        if (CR) {
            releaseBlobs();
        }
        var imgs = await renderPdf(url, title);
        if (!imgs || !imgs.length) {
            if (!gid("progress-error").classList.contains("show") && activeJob && !activeJob.cancelled) {
                setProgressError("未能渲染任何页面");
            }
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
    }

    function bindEvents() {
        gid("sidebarToggle").addEventListener("click", toggleSidebar);
        gid("sidebarCollapse").addEventListener("click", toggleSidebar);
        gid("searchInput").addEventListener("input", function (event) {
            filterTree(event.target.value);
        });
        gid("sortSelect").addEventListener("change", function (event) {
            onSortChange(event.target.value);
        });
        gid("toggleFoldBtn").addEventListener("click", toggleFoldAll);
        if (gid("toggleViewModeBtn")) {
            gid("toggleViewModeBtn").addEventListener("click", toggleViewMode);
        }
        if (gid("refreshCatalogBtn")) {
            gid("refreshCatalogBtn").addEventListener("click", refreshCatalog);
        }
        gid("clearCacheBtn").addEventListener("click", clearReaderCache);
        if (gid("shutdownServerBtn")) {
            gid("shutdownServerBtn").addEventListener("click", shutdownServer);
        }
        gid("reader-exit").addEventListener("click", exitReader);
        gid("progressCancel").addEventListener("click", cancelProgress);
        gid("progressClose").addEventListener("click", closeProgress);

        document.querySelectorAll(".folder-header").forEach(function (header) {
            header.addEventListener("click", function () {
                header.classList.toggle("collapsed");
                syncSidebarFolder(header.dataset.folder || "", !header.classList.contains("collapsed"));
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
    });
})();

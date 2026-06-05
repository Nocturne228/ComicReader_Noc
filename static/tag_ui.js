/**
 * Tag UI module for ComicReadScript catalog.
 * Keeps tag panels, dialogs, and context menu behavior out of catalog.js.
 *
 * @fileoverview Tag-related UI components and interactions.
 */
(function () {
    "use strict";

    /** @type {Object} Application state */
    var app = window.CatalogApp || {};
    /** @type {Object} Application configuration */
    var config = app.config || window.CATALOG_CONFIG || {};
    /** @type {string} Local storage key for tag visibility */
    var TAG_SHOW_KEY = "@catalogShowTags";
    /** @type {string|null} Current PDF path in tag dialog */
    var tagDialogCurrentPdf = null;
    /** @type {Array<string>} Current tags in tag dialog */
    var tagDialogCurrentTags = [];
    /** @type {string|null} Last right-clicked PDF path */
    var lastRightClickedPdf = null;

    /**
     * Get element by ID.
     * @param {string} id - Element ID.
     * @returns {HTMLElement|null} The element or null if not found.
     */
    function gid(id) {
        return app.gid ? app.gid(id) : document.getElementById(id);
    }

    /**
     * Get value from localStorage.
     * @param {string} key - Storage key.
     * @param {*} fallback - Default value.
     * @returns {*} Stored value or fallback.
     */
    function lsGet(key, fallback) {
        return app.lsGet ? app.lsGet(key, fallback) : fallback;
    }

    /**
     * Set value in localStorage.
     * @param {string} key - Storage key.
     * @param {*} value - Value to store.
     */
    function lsSet(key, value) {
        if (app.lsSet) app.lsSet(key, value);
    }

    /**
     * Set progress error message.
     * @param {string} message - Error message.
     * @param {string} title - Error title.
     */
    function setProgressError(message, title) {
        if (app.setProgressError) {
            app.setProgressError(message, title);
        }
    }

    /**
     * Bind click event handler to an element.
     * @param {string} id - Element ID.
     * @param {Function} handler - Click event handler.
     */
    function bindClick(id, handler) {
        if (app.bindClick) {
            app.bindClick(id, handler);
            return;
        }
        var element = gid(id);
        if (element) element.addEventListener("click", handler);
    }

    /**
     * Filter directory tree by search query.
     * @param {string} query - Search query string.
     */
    function filterTree(query) {
        if (app.filterTree) app.filterTree(query);
    }

    /**
     * Read error message from HTTP response.
     * @param {Response} response - Fetch response object.
     * @returns {Promise<string>} Error message string.
     */
    function readResponseMessage(response) {
        if (app.readResponseMessage) {
            return app.readResponseMessage(response);
        }
        return Promise.resolve("HTTP " + response.status);
    }

    /**
     * Check if tag editing is available.
     * @returns {boolean} True if tag editing is enabled.
     */
    function canEditTags() {
        return typeof TagManager !== "undefined" && TagManager.canEdit && TagManager.canEdit();
    }

    /**
     * Render tags for all cards in the catalog.
     */
    function renderAllCardTags() {
        if (typeof TagManager === "undefined") return;
        document.querySelectorAll(".card-tags").forEach(function (container) {
            var pdfPath = container.dataset.pdf || "";
            var tags = TagManager.getPdfTags(pdfPath);
            container.innerHTML = "";
            tags.forEach(function (tag) {
                var span = document.createElement("span");
                span.className = "card-tag";
                span.textContent = tag;
                container.appendChild(span);
            });
        });
    }

    /**
     * Render tags in the sidebar panel.
     */
    function renderSidebarTags() {
        if (typeof TagManager === "undefined") return;
        var tagsPanel = gid("sidebarTags");
        var tagsList = gid("sidebarTagsList");
        var tagsCount = gid("sidebarTagsCount");
        if (!tagsPanel || !tagsList) return;

        var allTags = TagManager.getAllTags();
        var counts = TagManager.getTagCounts();

        if (allTags.length === 0) {
            tagsPanel.style.display = "none";
            return;
        }

        tagsPanel.style.display = "";
        if (tagsCount) {
            tagsCount.textContent = allTags.length;
        }

        var currentSearch = (gid("searchInput") || {}).value || "";
        var parsed = TagManager.parseSearchQuery(currentSearch);
        var activeTags = parsed.tags;

        tagsList.innerHTML = "";
        allTags.forEach(function (tag) {
            var item = document.createElement("div");
            item.className = "sidebar-tag-item";
            if (activeTags.indexOf(tag) !== -1) {
                item.classList.add("active");
            }
            item.innerHTML = '<span class="sidebar-tag-name">' + escapeHtml(tag) + '</span>' +
                '<span class="sidebar-tag-count">' + (counts[tag] || 0) + '</span>';
            item.addEventListener("click", function () {
                toggleTagFilter(tag);
            });
            tagsList.appendChild(item);
        });
    }

    function toggleTagFilter(tag) {
        var searchInput = gid("searchInput");
        if (!searchInput || typeof TagManager === "undefined") return;
        var current = searchInput.value;
        var parsed = TagManager.parseSearchQuery(current);
        var idx = parsed.tags.indexOf(tag);
        if (idx === -1) {
            parsed.tags.push(tag);
        } else {
            parsed.tags.splice(idx, 1);
        }
        var parts = parsed.tags.map(function (t) { return ":" + t; });
        if (parsed.title) parts.push(parsed.title);
        searchInput.value = parts.join(" ");
        filterTree(searchInput.value);
        renderSidebarTags();
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function initTagDialog() {
        var backdrop = gid("tagDialogBackdrop");
        var cancelBtn = gid("tagDialogCancel");
        var saveBtn = gid("tagDialogSave");
        var addInput = gid("tagAddInput");
        var addBtn = gid("tagAddBtn");

        if (backdrop) backdrop.addEventListener("click", closeTagDialog);
        if (cancelBtn) cancelBtn.addEventListener("click", closeTagDialog);
        if (saveBtn) saveBtn.addEventListener("click", saveTagDialog);

        if (addBtn && addInput) {
            addBtn.addEventListener("click", function () {
                var val = addInput.value.trim();
                if (val && tagDialogCurrentTags.indexOf(val) === -1) {
                    tagDialogCurrentTags.push(val);
                    renderTagDialogContent();
                }
                addInput.value = "";
                addInput.focus();
            });
            addInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    addBtn.click();
                    event.preventDefault();
                }
            });
        }
    }

    function openTagDialogForHighlightedCard() {
        if (!lastRightClickedPdf) return;
        openTagDialog(lastRightClickedPdf);
    }

    function openNotesForHighlightedCard() {
        if (!lastRightClickedPdf || !window.PageNotes) return;
        var card = document.querySelector('.card[data-pdf="' + lastRightClickedPdf + '"]');
        var title = card ? card.querySelector(".card-title").textContent.trim() : lastRightClickedPdf;
        window.PageNotes.openForPdf(lastRightClickedPdf, title);
    }

    function openTagDialog(pdfPath) {
        if (typeof TagManager === "undefined") return;
        if (!canEditTags()) {
            setProgressError("标签编辑需要通过 --serve 启动本地服务", "标签编辑不可用");
            return;
        }
        tagDialogCurrentPdf = pdfPath;
        tagDialogCurrentTags = TagManager.getPdfTags(pdfPath).slice();

        var dialog = gid("tagDialog");
        var title = gid("tagDialogTitle");
        var desc = gid("tagDialogDesc");

        var parts = pdfPath.split("/");
        var name = parts[parts.length - 1] || pdfPath;
        try { name = decodeURIComponent(name); } catch (err) {}
        if (title) title.textContent = "编辑标签";
        if (desc) desc.textContent = name;

        renderTagDialogContent();
        if (dialog) dialog.style.display = "flex";
    }

    function closeTagDialog() {
        var dialog = gid("tagDialog");
        if (dialog) dialog.style.display = "none";
        tagDialogCurrentPdf = null;
        tagDialogCurrentTags = [];
    }

    function renderTagDialogContent() {
        var list = gid("tagCurrentList");
        var suggestions = gid("tagSuggestionList");
        if (!list) return;

        list.innerHTML = "";
        if (tagDialogCurrentTags.length === 0) {
            list.innerHTML = '<span class="tag-current-empty">暂无标签</span>';
        } else {
            tagDialogCurrentTags.forEach(function (tag) {
                var item = document.createElement("span");
                item.className = "tag-current-item";
                item.innerHTML = escapeHtml(tag) +
                    '<button type="button" class="tag-current-item-remove" data-tag="' + escapeHtml(tag) + '">&times;</button>';
                list.appendChild(item);
            });
            list.querySelectorAll(".tag-current-item-remove").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    var tag = this.dataset.tag;
                    tagDialogCurrentTags = tagDialogCurrentTags.filter(function (t) { return t !== tag; });
                    renderTagDialogContent();
                });
            });
        }

        if (suggestions && typeof TagManager !== "undefined") {
            var allTags = TagManager.getAllTags();
            suggestions.innerHTML = "";
            allTags.forEach(function (tag) {
                var item = document.createElement("button");
                item.type = "button";
                item.className = "tag-suggestion-item";
                item.textContent = tag;
                if (tagDialogCurrentTags.indexOf(tag) !== -1) {
                    item.classList.add("selected");
                }
                item.addEventListener("click", function () {
                    var idx = tagDialogCurrentTags.indexOf(tag);
                    if (idx === -1) {
                        tagDialogCurrentTags.push(tag);
                    } else {
                        tagDialogCurrentTags.splice(idx, 1);
                    }
                    renderTagDialogContent();
                });
                suggestions.appendChild(item);
            });
        }
    }

    function saveTagDialog() {
        if (!tagDialogCurrentPdf || typeof TagManager === "undefined") return;
        var saveBtn = gid("tagDialogSave");
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "保存中...";
        }

        TagManager.updatePdfTags(tagDialogCurrentPdf, tagDialogCurrentTags)
            .then(function (data) {
                if (data && data.ok) {
                    closeTagDialog();
                } else {
                    var msg = (data && data.message) || "保存失败";
                    setProgressError("标签保存失败: " + msg);
                }
            })
            .catch(function (err) {
                setProgressError("标签保存失败: " + (err.message || "网络错误"));
            })
            .then(function () {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = "保存";
                }
            });
    }

    function initContextMenu() {
        var menu = gid("contextMenu");
        if (!menu) return;

        document.addEventListener("contextmenu", function (event) {
            var card = event.target.closest(".card");
            if (!card) {
                menu.style.display = "none";
                lastRightClickedPdf = null;
                return;
            }
            event.preventDefault();
            var pdfPath = card.dataset.pdf || "";
            var title = card.dataset.title || "";

            lastRightClickedPdf = pdfPath;
            menu.dataset.pdf = pdfPath;
            menu.dataset.title = title;
            menu.style.display = "block";
            menu.style.left = Math.min(event.clientX, window.innerWidth - 180) + "px";
            menu.style.top = Math.min(event.clientY, window.innerHeight - 120) + "px";

            var previewItem = gid("contextMenuPreview");
            if (previewItem) {
                previewItem.style.display = config.nativeOpenEnabled ? "" : "none";
            }
            var editTagsItem = gid("contextMenuEditTags");
            if (editTagsItem) {
                editTagsItem.style.display = canEditTags() ? "" : "none";
            }
            var notesItem = gid("contextMenuNotes");
            if (notesItem) {
                notesItem.style.display = window.PageNotes ? "" : "none";
            }
        });

        document.addEventListener("click", function () {
            menu.style.display = "none";
            lastRightClickedPdf = null;
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && menu.style.display !== "none") {
                menu.style.display = "none";
                lastRightClickedPdf = null;
                event.preventDefault();
            }
        });

        bindClick("contextMenuRead", function () {
            var pdfPath = menu.dataset.pdf;
            if (!pdfPath) return;
            var card = document.querySelector('.card[data-pdf="' + pdfPath + '"]');
            if (card) {
                var cover = card.querySelector(".card-cover");
                if (cover) cover.click();
            }
        });

        bindClick("contextMenuPreview", function () {
            var pdfPath = menu.dataset.pdf;
            if (!pdfPath || !config.serverControl) return;
            fetch(config.nativeOpenPath || "/__open_native", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-ComicReader-Token": config.shutdownToken || "",
                },
                body: JSON.stringify({ pdf: pdfPath }),
            }).then(function (response) {
                if (!response.ok) {
                    return readResponseMessage(response).then(function (message) {
                        throw new Error(message);
                    });
                }
            }).catch(function (err) {
                setProgressError("Preview 打开失败: " + (err.message || "网络错误"));
            });
        });

        bindClick("contextMenuEditTags", function () {
            var pdfPath = menu.dataset.pdf;
            if (pdfPath) openTagDialog(pdfPath);
        });

        bindClick("contextMenuNotes", function () {
            var pdfPath = menu.dataset.pdf;
            if (pdfPath && window.PageNotes) {
                var card = document.querySelector('.card[data-pdf="' + pdfPath + '"]');
                var title = card ? card.querySelector(".card-title").textContent.trim() : pdfPath;
                window.PageNotes.openForPdf(pdfPath, title);
            }
        });
    }

    function initTagSystem() {
        if (typeof TagManager === "undefined") return;

        TagManager.fetch()
            .then(function () {
                renderAllCardTags();
                renderSidebarTags();
            })
            .catch(function (err) {
                renderAllCardTags();
                renderSidebarTags();
                setProgressError("标签加载失败: " + (err.message || "网络错误"));
            });

        TagManager.onChange(function () {
            renderAllCardTags();
            renderSidebarTags();
        });

        var showTags = lsGet(TAG_SHOW_KEY, "0") === "1";
        document.body.classList.toggle("show-tags", showTags);
        var toggleBtn = gid("toggleTagsBtn");
        if (toggleBtn) {
            toggleBtn.classList.toggle("active", showTags);
            toggleBtn.addEventListener("click", function () {
                var current = document.body.classList.contains("show-tags");
                var newVal = !current;
                lsSet(TAG_SHOW_KEY, newVal ? "1" : "0");
                document.body.classList.toggle("show-tags", newVal);
                toggleBtn.classList.toggle("active", newVal);
                if (newVal) renderAllCardTags();
            });
        }

        var tagsToggle = gid("sidebarTagsToggle");
        var tagsList = gid("sidebarTagsList");
        if (tagsToggle && tagsList) {
            tagsToggle.addEventListener("click", function () {
                var expanded = tagsList.classList.toggle("expanded");
                tagsToggle.classList.toggle("expanded", expanded);
            });
        }

        initTagDialog();
        initContextMenu();
    }

    window.TagUI = {
        init: initTagSystem,
        isDialogVisible: function () {
            var dialog = gid("tagDialog");
            return !!dialog && dialog.style.display === "flex";
        },
        closeDialog: closeTagDialog,
        saveDialog: saveTagDialog,
        openDialogForHighlightedCard: openTagDialogForHighlightedCard,
        openNotesForHighlightedCard: openNotesForHighlightedCard,
        renderSidebarTags: renderSidebarTags,
        renderAllCardTags: renderAllCardTags,
    };
})();

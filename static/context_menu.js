/**
 * Context menu module for ComicReadScript catalog.
 * Handles right-click context menu for PDF cards.
 */
(function () {
    "use strict";

    var app = window.CatalogApp || {};
    var config = app.config || window.CATALOG_CONFIG || {};
    var lastRightClickedPdf = null;

    function gid(id) {
        return app.gid ? app.gid(id) : document.getElementById(id);
    }

    function bindClick(id, handler) {
        var el = gid(id);
        if (el) el.addEventListener("click", handler);
    }

    function readResponseMessage(response) {
        return response.text().then(function (text) {
            try {
                var data = JSON.parse(text);
                return data.message || data.error || text;
            } catch (e) {
                return text;
            }
        });
    }

    function setProgressError(msg) {
        if (typeof window.setProgressError === "function") {
            window.setProgressError(msg);
        } else {
            console.error(msg);
        }
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
    }

    function init() {
        initContextMenu();
    }

    window.ContextMenu = {
        init: init,
        getLastRightClickedPdf: function () { return lastRightClickedPdf; },
    };
})();

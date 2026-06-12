import { CONFIG } from "./config.js";
import { gid, bindClick } from "./utils.js";
import { setProgressError } from "./progress.js";

var lastRightClickedPdf = null;

export function initContextMenu() {
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
            previewItem.style.display = CONFIG.nativeOpenEnabled ? "" : "none";
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
        if (!pdfPath || !CONFIG.serverControl) return;
        fetch(CONFIG.nativeOpenPath || "/__open_native", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-ComicReader-Token": CONFIG.shutdownToken || "",
            },
            body: JSON.stringify({ pdf: pdfPath }),
        }).then(function (response) {
            if (!response.ok) {
                return response.text().then(function (text) {
                    try {
                        var data = JSON.parse(text);
                        throw new Error(data.message || data.error || text);
                    } catch (e) {
                        if (e instanceof SyntaxError) throw new Error(text);
                        throw e;
                    }
                });
            }
        }).catch(function (err) {
            setProgressError("Preview 打开失败: " + (err.message || "网络错误"));
        });
    });
}

export function getLastRightClickedPdf() {
    return lastRightClickedPdf;
}

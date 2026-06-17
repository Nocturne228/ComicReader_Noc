import { CONFIG } from "./config.js";
import { gid, bindClick } from "./utils.js";
import { setProgressError } from "./progress.js";
import { openNativePdfPath } from "./server-control.js";

export function initContextMenu() {
    var menu = gid("contextMenu");
    if (!menu) return;

    document.addEventListener("contextmenu", function (event) {
        var card = event.target.closest(".card");
        if (!card) {
            menu.style.display = "none";
            return;
        }
        event.preventDefault();
        var pdfPath = card.dataset.pdf || "";
        var title = card.dataset.title || "";

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
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && menu.style.display !== "none") {
            menu.style.display = "none";
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
        openNativePdfPath(pdfPath).catch(function (err) {
            setProgressError("Preview 打开失败: " + (err.message || "网络错误"));
        });
    });
}

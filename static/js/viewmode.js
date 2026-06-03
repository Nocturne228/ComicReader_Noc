/**
 * 视图模式模块
 * 负责网页阅读/Preview模式的切换
 */
var ViewMode = (function () {
    "use strict";

    var VIEW_MODE = Utils.lsGet("@viewMode", "reader");

    function updateViewModeBtn() {
        var btn = Utils.gid("toggleViewModeBtn");
        if (!btn) {
            return;
        }
        if (!CatalogConfig.nativeOpenEnabled) {
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
        if (!CatalogConfig.nativeOpenEnabled) {
            return;
        }
        VIEW_MODE = VIEW_MODE === "reader" ? "native" : "reader";
        Utils.lsSet("@viewMode", VIEW_MODE);
        updateViewModeBtn();
    }

    function getViewMode() {
        return VIEW_MODE;
    }

    return {
        updateViewModeBtn: updateViewModeBtn,
        toggleViewMode: toggleViewMode,
        getViewMode: getViewMode,
    };
})();

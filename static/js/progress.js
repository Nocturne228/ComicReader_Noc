/**
 * 进度显示模块
 * 负责进度条的显示、更新、错误处理
 */
var Progress = (function () {
    "use strict";

    function showProgress(show, text) {
        var overlay = Utils.gid("progress-overlay");
        if (!overlay) {
            return;
        }
        overlay.style.display = show ? "flex" : "none";
        if (text) {
            Utils.gid("progress-title").textContent = text;
        }
    }

    function setProgress(progress) {
        var fill = Utils.gid("progress-fill");
        if (fill) {
            fill.style.width = Math.round(progress) + "%";
        }
    }

    function setProgressError(message, title) {
        showProgress(true, title || "任务失败");
        var text = Utils.gid("progress-text");
        var error = Utils.gid("progress-error");
        if (text) {
            text.textContent = "";
        }
        if (error) {
            error.textContent = message;
        }
        var actions = Utils.gid("progress-overlay");
        if (actions) {
            actions.classList.add("has-error");
        }
    }

    function clearProgressError() {
        var error = Utils.gid("progress-error");
        if (error) {
            error.textContent = "";
        }
        var overlay = Utils.gid("progress-overlay");
        if (overlay) {
            overlay.classList.remove("has-error");
        }
    }

    function closeProgress() {
        showProgress(false);
        setProgress(0);
        clearProgressError();
        var note = Utils.gid("progress-note");
        if (note) {
            note.textContent = "";
        }
    }

    var cancelCallback = null;

    function setCancelCallback(cb) {
        cancelCallback = cb;
    }

    function cancelProgress() {
        if (cancelCallback) {
            cancelCallback();
        }
        closeProgress();
    }

    return {
        showProgress: showProgress,
        setProgress: setProgress,
        setProgressError: setProgressError,
        clearProgressError: clearProgressError,
        closeProgress: closeProgress,
        setCancelCallback: setCancelCallback,
        cancelProgress: cancelProgress,
    };
})();

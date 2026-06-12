import { gid } from "./utils.js";
import { getActiveJob } from "./state.js";

export function showProgress(show, text) {
    var overlay = gid("progress-overlay");
    overlay.classList.toggle("active", show);
    if (show) overlay.classList.remove("error");
    gid("progress-note").textContent = "";
    if (text) gid("progress-text").textContent = text;
}

export function setProgress(progress) {
    gid("progress-fill").style.width = Math.round(progress * 100) + "%";
    gid("progress-text").textContent = Math.round(progress * 100) + "%";
}

export function setProgressError(message, title) {
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

export function clearProgressError() {
    var error = gid("progress-error");
    error.classList.remove("show");
    error.textContent = "";
    gid("progress-overlay").classList.remove("error");
}

export function closeProgress() {
    gid("progress-overlay").classList.remove("active", "error");
    gid("progress-note").textContent = "";
}

export function cancelProgress() {
    var job = getActiveJob();
    if (job) {
        job.cancelled = true;
        if (job.abortController) job.abortController.abort();
    }
    closeProgress();
}

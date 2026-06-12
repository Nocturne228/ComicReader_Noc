import { CONFIG } from "./config.js";
import { gid } from "./utils.js";
import { getActiveJob, setActiveJob } from "./state.js";
import { setProgressError, closeProgress, clearProgressError } from "./progress.js";

export async function readResponseMessage(response, fallback) {
    var message = fallback || "HTTP " + response.status;
    try {
        var body = await response.clone().json();
        if (body && body.message) message = body.message;
    } catch (err) {
        try {
            var text = await response.text();
            if (text) message = text;
        } catch (textErr) {}
    }
    return message;
}

export async function postControlJson(path, body) {
    var response = await fetch(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-ComicReader-Token": CONFIG.shutdownToken || "",
        },
        body: JSON.stringify(body || {}),
    });
    if (!response.ok) throw Error(await readResponseMessage(response));
    return response.json().catch(function () { return {}; });
}

export async function shutdownServer() {
    var button = gid("shutdownServerBtn");
    if (!button) return;
    button.disabled = true;
    button.textContent = "正在关闭...";
    try {
        var response = await fetch(CONFIG.shutdownPath || "/__shutdown", {
            method: "POST",
            headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
        });
        if (!response.ok) throw Error("HTTP " + response.status);
        button.textContent = "已关闭";
    } catch (err) {
        button.disabled = false;
        button.textContent = "关闭服务";
        setProgressError("关闭服务失败: " + err.message);
    }
}

export async function refreshCatalog() {
    var button = gid("refreshCatalogBtn");
    if (!button) return;
    button.disabled = true;
    button.textContent = "刷新中...";
    try {
        var response = await fetch(CONFIG.refreshPath || "/__refresh", {
            method: "POST",
            headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
        });
        var body = await response.json().catch(function () { return {}; });
        if (!response.ok) throw Error(body.message || "HTTP " + response.status);
        button.textContent = "已更新";
        window.setTimeout(function () { location.reload(); }, 250);
    } catch (err) {
        button.disabled = false;
        button.textContent = "刷新目录";
        setProgressError("刷新目录失败: " + err.message);
    }
}

export async function openNativePdf(card) {
    if (!CONFIG.nativeOpenEnabled) {
        setProgressError("Preview 打开需要通过 --serve 启动本地服务", "Preview 打开失败");
        return;
    }
    var job = getActiveJob();
    if (job) {
        job.cancelled = true;
        if (job.abortController) job.abortController.abort();
        setActiveJob(null);
    }
    closeProgress();
    clearProgressError();
    try {
        var pdfUrl = new URL(card.dataset.pdf || "", location.href);
        var pdfPath = pdfUrl.pathname.replace(/^\/+/, "");
        try { pdfPath = decodeURIComponent(pdfPath); } catch (decodeErr) { pdfPath = pdfUrl.pathname.replace(/^\/+/, ""); }
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
                if (data && data.message) message = data.message;
            } catch (err) { message = "HTTP " + response.status; }
            throw Error(message);
        }
    } catch (err) {
        setProgressError("Preview 打开失败: " + err.message, "Preview 打开失败");
    }
}

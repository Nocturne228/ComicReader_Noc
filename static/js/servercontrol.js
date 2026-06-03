/**
 * 服务器控制模块
 * 负责关闭服务、刷新目录、重启服务等服务器操作
 */
var ServerControl = (function () {
    "use strict";

    async function shutdownServer() {
        var btn = Utils.gid("shutdownServerBtn");
        if (btn) {
            btn.disabled = true;
        }
        try {
            await postControlJson(CatalogConfig.shutdownPath || "/__shutdown", {
                token: CatalogConfig.shutdownToken || "",
            });
        } catch (err) {
            Progress.setProgressError("关闭服务失败: " + err.message);
            if (btn) {
                btn.disabled = false;
            }
        }
    }

    async function refreshCatalog() {
        var btn = Utils.gid("refreshCatalogBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "刷新中...";
        }
        try {
            var response = await fetch(CatalogConfig.refreshPath || "/__refresh", {
                method: "POST",
                headers: { "X-ComicReader-Token": CatalogConfig.shutdownToken || "" },
            });
            if (!response.ok) {
                throw Error(await readResponseMessage(response));
            }
            location.reload();
        } catch (err) {
            Progress.setProgressError("刷新失败: " + err.message);
            if (btn) {
                btn.disabled = false;
                btn.textContent = "刷新目录";
            }
        }
    }

    async function readResponseMessage(response, fallback) {
        var text = await response.text();
        var trimmed = text.trim();
        if (!trimmed) {
            return fallback || "请求失败 (" + response.status + ")";
        }
        try {
            var obj = JSON.parse(trimmed);
            return obj.error || obj.message || trimmed;
        } catch (e) {
            return trimmed;
        }
    }

    async function postControlJson(path, body) {
        var response = await fetch(path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-ComicReader-Token": CatalogConfig.shutdownToken || "",
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            throw Error(await readResponseMessage(response));
        }
        return response;
    }

    function getToolOpenPath() {
        var select = Utils.gid("toolFolderSelect");
        var value = select ? select.value : "";
        return value;
    }

    async function openToolFolder(folder, button) {
        if (button) {
            button.disabled = true;
        }
        try {
            await postControlJson("/__open", { path: folder || "" });
        } catch (err) {
            Progress.setProgressError("打开目录失败: " + err.message);
        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    }

    async function openNativePdf(card) {
        var filePath = card.dataset.path;
        if (!filePath) {
            Progress.setProgressError("无法获取文件路径");
            return;
        }
        try {
            await postControlJson("/__open", { path: filePath });
        } catch (err) {
            Progress.setProgressError("打开 PDF 失败: " + err.message);
        }
    }

    function isShortcutHelpVisible() {
        return Utils.gid("shortcutHelp").style.display === "flex";
    }

    function setShortcutHelp(open) {
        Utils.gid("shortcutHelp").style.display = open ? "flex" : "none";
    }

    function toggleShortcutHelp() {
        setShortcutHelp(!isShortcutHelpVisible());
    }

    return {
        shutdownServer: shutdownServer,
        refreshCatalog: refreshCatalog,
        readResponseMessage: readResponseMessage,
        postControlJson: postControlJson,
        getToolOpenPath: getToolOpenPath,
        openToolFolder: openToolFolder,
        openNativePdf: openNativePdf,
        isShortcutHelpVisible: isShortcutHelpVisible,
        setShortcutHelp: setShortcutHelp,
        toggleShortcutHelp: toggleShortcutHelp,
    };
})();

/**
 * 重启服务模块
 * 负责重启确认对话框和重启进度的处理
 */
var Restart = (function () {
    "use strict";

    function closeRestartDialog() {
        Utils.gid("restartDialog").style.display = "none";
    }

    function closeRestartProgressDialog() {
        Utils.gid("restartProgressDialog").style.display = "none";
    }

    async function confirmRestart() {
        // 关闭确认对话框
        Utils.gid("restartDialog").style.display = "none";
        // 显示重启进度对话框
        Utils.gid("restartProgressDialog").style.display = "flex";

        try {
            var response = await fetch(CatalogConfig.restartPath || "/__restart", {
                method: "POST",
                headers: { "X-ComicReader-Token": CatalogConfig.shutdownToken || "" },
            });
            if (!response.ok) {
                throw Error(await ServerControl.readResponseMessage(response));
            }
        } catch (err) {
            Utils.gid("restartProgressDialog").style.display = "none";
            Progress.setProgressError("重启服务失败: " + err.message);
            return;
        }
        // 轮询等待服务恢复，用时间戳参数绕过浏览器缓存
        function poll() {
            var ts = Date.now();
            // 轮询请求带时间戳绕过浏览器缓存，确认服务已恢复
            fetch(location.href.split("?")[0] + "?_t=" + ts).then(function () {
                // 导航回原始干净 URL，同一标签页替换旧页面
                location.replace(location.href.split("?")[0]);
            }).catch(function () { setTimeout(poll, 1000); });
        }
        setTimeout(poll, 2000);
    }

    return {
        closeRestartDialog: closeRestartDialog,
        closeRestartProgressDialog: closeRestartProgressDialog,
        confirmRestart: confirmRestart,
    };
})();

import { CONFIG } from "./config.js";
import { gid, bindClick } from "./utils.js";
import { setProgressError } from "./progress.js";
import { readResponseMessage } from "./server-control.js";

export function closeRestartDialog() {
    gid("restartDialog").style.display = "none";
    gid("restartConfirm").focus();
}

export function closeRestartProgressDialog() {
    gid("restartProgressDialog").style.display = "none";
}

export async function handleRestartConfirm() {
    var restartDialog = gid("restartDialog");
    var restartProgressDialog = gid("restartProgressDialog");
    restartDialog.style.display = "none";
    restartProgressDialog.style.display = "flex";

    try {
        var response = await fetch(CONFIG.restartPath || "/__restart", {
            method: "POST",
            headers: { "X-ComicReader-Token": CONFIG.shutdownToken || "" },
        });
        if (!response.ok) throw Error(await readResponseMessage(response));
    } catch (err) {
        restartProgressDialog.style.display = "none";
        setProgressError("重启服务失败: " + err.message);
        return;
    }

    function poll() {
        var ts = Date.now();
        fetch(location.href.split("?")[0] + "?_t=" + ts).then(function () {
            location.replace(location.href.split("?")[0]);
        }).catch(function () { setTimeout(poll, 1000); });
    }
    setTimeout(poll, 2000);
}

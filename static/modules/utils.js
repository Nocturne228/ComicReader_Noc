export function gid(id) {
    return document.getElementById(id);
}

export function bindClick(id, handler) {
    var el = gid(id);
    if (el) el.addEventListener("click", handler);
}

export function loadScript(url) {
    return new Promise(function (resolve, reject) {
        if (document.querySelector('script[src="' + url + '"]')) {
            resolve();
            return;
        }
        var script = document.createElement("script");
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export function lsGet(key, fallback) {
    try {
        var value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (err) {
        return localStorage.getItem(key) || fallback;
    }
}

export function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

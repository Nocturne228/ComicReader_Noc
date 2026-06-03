/**
 * 工具函数模块
 * 提供基础的DOM操作、本地存储、脚本加载等通用功能
 */
var Utils = (function () {
    "use strict";

    function gid(id) {
        return document.getElementById(id);
    }

    function bindClick(id, handler) {
        var element = gid(id);
        if (element) {
            element.addEventListener("click", handler);
        }
    }

    function isMobile() {
        return window.matchMedia("(max-width: 768px)").matches;
    }

    function loadScript(url) {
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

    function lsGet(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (err) {
            return localStorage.getItem(key) || fallback;
        }
    }

    function lsSet(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isTextEntryTarget(target) {
        var tag = target.tagName;
        return (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT" ||
            target.isContentEditable
        );
    }

    function releaseBlobList(imgs) {
        if (!imgs) return;
        imgs.forEach(function (img) {
            if (img && img.src && img.src.startsWith("blob:")) {
                URL.revokeObjectURL(img.src);
            }
        });
    }

    function cleanToolOutput(text) {
        return text.replace(/\x1B\[[0-9;]*[mGKH]/g, "");
    }

    return {
        gid: gid,
        bindClick: bindClick,
        isMobile: isMobile,
        loadScript: loadScript,
        lsGet: lsGet,
        lsSet: lsSet,
        clamp: clamp,
        isTextEntryTarget: isTextEntryTarget,
        releaseBlobList: releaseBlobList,
        cleanToolOutput: cleanToolOutput,
    };
})();

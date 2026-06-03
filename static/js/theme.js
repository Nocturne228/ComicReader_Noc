/**
 * 主题管理模块
 * 负责日间/夜间模式的切换和初始化
 */
var Theme = (function () {
    "use strict";

    var THEME_KEY = "@theme";

    function applyTheme(isDark) {
        if (isDark) {
            document.documentElement.classList.add("dark-theme");
        } else {
            document.documentElement.classList.remove("dark-theme");
        }
        var icon = Utils.gid("themeIcon");
        var toggle = Utils.gid("themeToggle");
        if (icon) {
            icon.textContent = isDark ? "🌙" : "☀️";
        }
        if (toggle) {
            toggle.setAttribute("aria-checked", isDark ? "true" : "false");
            toggle.title = isDark ? "切换到日间模式" : "切换到夜间模式";
        }
    }

    function toggleTheme() {
        var isDark = document.documentElement.classList.contains("dark-theme");
        var newIsDark = !isDark;
        Utils.lsSet(THEME_KEY, newIsDark ? "dark" : "light");
        applyTheme(newIsDark);
    }

    function initTheme() {
        var saved = Utils.lsGet(THEME_KEY, null);
        if (saved === "dark") {
            applyTheme(true);
        } else if (saved === "light") {
            applyTheme(false);
        } else {
            applyTheme(false);
        }
    }

    return {
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        initTheme: initTheme,
    };
})();

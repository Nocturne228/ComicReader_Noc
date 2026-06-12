import { gid, lsGet, lsSet } from "./utils.js";

var THEME_KEY = "@theme";

function applyTheme(isDark) {
    if (isDark) {
        document.documentElement.classList.add("dark-theme");
    } else {
        document.documentElement.classList.remove("dark-theme");
    }
    var icon = gid("themeIcon");
    var toggle = gid("themeToggle");
    if (icon) icon.textContent = isDark ? "🌙" : "☀️";
    if (toggle) {
        toggle.setAttribute("aria-checked", isDark ? "true" : "false");
        toggle.title = isDark ? "切换到日间模式" : "切换到夜间模式";
    }
}

export function toggleTheme() {
    var isDark = document.documentElement.classList.contains("dark-theme");
    lsSet(THEME_KEY, !isDark ? "dark" : "light");
    applyTheme(!isDark);
}

export function initTheme() {
    var saved = lsGet(THEME_KEY, null);
    applyTheme(saved === "dark");
}

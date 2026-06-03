/**
 * 侧边栏模块
 * 负责侧边栏的打开/关闭、宽度调整、移动端适配
 */
var Sidebar = (function () {
    "use strict";

    var SIDEBAR_STATE = "@sidebarState";
    var DEFAULT_SIDEBAR_WIDTH = 268;
    var MIN_SIDEBAR_WIDTH = 220;
    var MAX_SIDEBAR_WIDTH = 520;

    function applySidebarWidth(width) {
        var safeWidth = Utils.clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        document.documentElement.style.setProperty(
            "--sidebar-width",
            safeWidth + "px",
        );
    }

    function initSidebarResize() {
        var resizer = Utils.gid("sidebarResizer");
        if (!resizer || Utils.isMobile()) {
            setSidebar(false);
            return;
        }
        applySidebarWidth(Utils.lsGet(SIDEBAR_STATE, "width") || DEFAULT_SIDEBAR_WIDTH);
        var startX = 0;
        var startWidth = 0;

        function onMouseDown(e) {
            e.preventDefault();
            startX = e.clientX;
            startWidth = document.documentElement
                .getComputedStyle(document.documentElement)
                .getPropertyValue("--sidebar-width");
            startWidth = parseInt(startWidth, 10) || DEFAULT_SIDEBAR_WIDTH;
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        }

        function onMouseMove(e) {
            applySidebarWidth(startWidth + e.clientX - startX);
        }

        function onMouseUp() {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            var current = document.documentElement
                .getComputedStyle(document.documentElement)
                .getPropertyValue("--sidebar-width");
            current = parseInt(current, 10) || DEFAULT_SIDEBAR_WIDTH;
            Utils.lsSet(SIDEBAR_STATE, "width");
            Utils.lsSet(SIDEBAR_STATE + "_w", current);
        }

        resizer.addEventListener("mousedown", onMouseDown);
    }

    function setSidebar(open) {
        var sidebar = Utils.gid("sidebar");
        if (!sidebar) {
            return;
        }
        sidebar.classList.toggle("collapsed", !open);
        if (!Utils.isMobile()) {
            Utils.lsSet(SIDEBAR_STATE, open ? "expanded" : "collapsed");
        }
    }

    function toggleSidebar() {
        setSidebar(Utils.gid("sidebar") && !Utils.gid("sidebar").classList.contains("collapsed"));
    }

    function closeSidebarOnMobile() {
        if (Utils.isMobile()) {
            setSidebar(false);
        }
    }

    return {
        applySidebarWidth: applySidebarWidth,
        initSidebarResize: initSidebarResize,
        setSidebar: setSidebar,
        toggleSidebar: toggleSidebar,
        closeSidebarOnMobile: closeSidebarOnMobile,
        DEFAULT_SIDEBAR_WIDTH: DEFAULT_SIDEBAR_WIDTH,
    };
})();

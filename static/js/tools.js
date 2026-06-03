/**
 * 文件管理工具模块
 * 负责PDF缩放、裁剪、ZIP转PDF等工具
 */
var Tools = (function () {
    "use strict";

    var activeTool = null;
    var toolRunning = false;

    var TOOL_INFO = {
        x: {
            name: "PDF 缩放工具",
            desc: "将 PDF 中的漫画页面放大到指定倍率",
            color: "#4d8df7",
        },
        y: {
            name: "PDF 裁剪工具",
            desc: "根据白边自动裁剪 PDF 中的漫画页面",
            color: "#f59e42",
        },
        z: {
            name: "ZIP→PDF 工具",
            desc: "将 ZIP / CBZ 中的图片打包为 PDF",
            color: "#43b581",
        },
    };

    var TOOL_FORMS = {
        x: function () {
            return (
                '<div class="form-row"><label>缩放倍率</label>' +
                '<input type="number" class="form-input" id="toolParamScale" value="1.5" min="0.5" max="5" step="0.1"></div>'
            );
        },
        y: function () {
            return (
                '<div class="form-row"><label>边距 (px)</label>' +
                '<input type="number" class="form-input" id="toolParamMargin" value="10" min="0" max="100"></div>' +
                '<div class="form-row"><label>白色阈值</label>' +
                '<input type="number" class="form-input" id="toolParamThreshold" value="240" min="0" max="255"></div>'
            );
        },
        z: function () {
            return (
                '<div class="form-row"><label>图片质量</label>' +
                '<input type="number" class="form-input" id="toolParamQuality" value="0.92" min="0.1" max="1" step="0.01"></div>' +
                '<div class="form-row"><label>页面尺寸</label>' +
                '<select class="form-select" id="toolParamSize">' +
                '<option value="fit">适应图片</option>' +
                '<option value="a4" selected>A4</option>' +
                '</select></div>'
            );
        },
    };

    function collectFolders(nodes, result) {
        if (!result) result = [];
        nodes.forEach(function (node) {
            if (node.type === "dir") {
                result.push(node.folder || node.name);
                if (node.children) {
                    collectFolders(node.children, result);
                }
            }
        });
        return result;
    }

    function populateFolderSelect() {
        var select = Utils.gid("toolFolderSelect");
        if (!select) return;
        select.innerHTML = "";
        var folders = collectFolders(TREE, []);
        folders.forEach(function (f) {
            var opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f || "(根目录)";
            select.appendChild(opt);
        });
    }

    function buildToolForm(tool) {
        var container = Utils.gid("toolParamsForm");
        if (!container) return;
        var builder = TOOL_FORMS[tool];
        container.innerHTML = builder ? builder() : "";
    }

    function openToolDialog(tool) {
        activeTool = tool;
        var info = TOOL_INFO[tool];
        if (!info) return;
        Utils.gid("toolDialogTitle").textContent = info.name;
        Utils.gid("toolDialogDesc").textContent = info.desc;
        populateFolderSelect();
        buildToolForm(tool);
        Utils.gid("toolDialog").style.display = "flex";
        Utils.gid("toolResultOutput").textContent = "";
        Utils.gid("toolOutputWrap").style.display = "none";
    }

    function closeToolDialog() {
        Utils.gid("toolDialog").style.display = "none";
        activeTool = null;
    }

    function gatherToolParams(tool) {
        var params = {};
        if (tool === "x") {
            params.scale = parseFloat(Utils.gid("toolParamScale").value) || 1.5;
        } else if (tool === "y") {
            params.margin = parseInt(Utils.gid("toolParamMargin").value) || 10;
            params.threshold = parseInt(Utils.gid("toolParamThreshold").value) || 240;
        } else if (tool === "z") {
            params.quality = parseFloat(Utils.gid("toolParamQuality").value) || 0.92;
            params.pageSize = Utils.gid("toolParamSize").value || "a4";
        }
        return params;
    }

    function isToolDialogVisible() {
        return Utils.gid("toolDialog").style.display === "flex";
    }

    async function runTool() {
        if (toolRunning || !activeTool) return;
        toolRunning = true;
        var btn = Utils.gid("toolDialogRun");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "执行中...";
        }
        var folder = ServerControl.getToolOpenPath();
        var params = gatherToolParams(activeTool);
        Progress.showProgress(true, TOOL_INFO[activeTool].name + " 运行中...");
        Progress.setProgress(0);
        try {
            var response = await fetch("/__tool/" + activeTool, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-ComicReader-Token": CatalogConfig.shutdownToken || "",
                },
                body: JSON.stringify({ folder: folder, params: params }),
            });
            var result = await response.json();
            var output = Utils.gid("toolResultOutput");
            var wrap = Utils.gid("toolOutputWrap");
            if (output && wrap) {
                output.textContent = Utils.cleanToolOutput(result.output || "");
                wrap.style.display = "block";
            }
            Progress.setProgress(100);
            Progress.closeProgress();
        } catch (err) {
            Progress.setProgressError("工具执行失败: " + err.message);
        } finally {
            toolRunning = false;
            if (btn) {
                btn.disabled = false;
                btn.textContent = "执行";
            }
        }
    }

    return {
        TOOL_INFO: TOOL_INFO,
        activeTool: activeTool,
        toolRunning: toolRunning,
        collectFolders: collectFolders,
        populateFolderSelect: populateFolderSelect,
        buildToolForm: buildToolForm,
        openToolDialog: openToolDialog,
        closeToolDialog: closeToolDialog,
        gatherToolParams: gatherToolParams,
        isToolDialogVisible: isToolDialogVisible,
        runTool: runTool,
    };
})();

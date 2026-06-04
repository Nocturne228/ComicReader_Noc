(function () {
    "use strict";

    var app = null;
    var activeTool = null;
    var toolRunning = false;

    var TOOL_INFO = {
        x: {
            name: "PDF尺寸缩放",
            desc: "对选中目录中的所有 PDF 文件统一页面尺寸，原文件备份到 x_backup",
        },
        y: {
            name: "PDF页面裁剪",
            desc: "对选中目录中的所有 PDF 文件删除指定页面，原文件备份到 y_backup",
        },
        z: {
            name: "ZIP转PDF",
            desc: "对选中目录中的所有 ZIP 压缩包解压并合成为 PDF",
        },
    };

    var TOOL_FORMS = {
        x: function () {
            return '\
            <div class="form-row">\
                <label>尺寸预设</label>\
                <div class="radio-group">\
                    <label class="radio-label">\
                        <input type="radio" name="sizePreset" value="a4" id="toolParamPresetA4" checked>\
                        A4 标准 (210×297mm)\
                    </label>\
                    <label class="radio-label">\
                        <input type="radio" name="sizePreset" value="custom" id="toolParamPresetCustom">\
                        自定义\
                    </label>\
                </div>\
            </div>\
            <div class="form-row-inline">\
                <label>目标宽度</label>\
                <input type="number" class="form-input" id="toolParamWidth" value="210" min="10" max="999" step="1">\
                <span class="form-unit">mm</span>\
            </div>\
            <div class="form-row-inline" id="toolParamHeightRow">\
                <label>目标高度</label>\
                <input type="number" class="form-input" id="toolParamHeight" value="297" min="10" max="999" step="1">\
                <span class="form-unit">mm</span>\
            </div>\
            <div class="form-row">\
                <label class="checkbox-label">\
                    <input type="checkbox" id="toolParamStrip">\
                    条形漫画模式 <span class="form-note">（仅固定宽度，高度自适应）</span>\
                </label>\
            </div>';
        },
        y: function () {
            return '\
            <div class="form-row">\
                <label>删除方式</label>\
                <select class="form-select" id="toolParamMode">\
                    <option value="single">删除指定单页</option>\
                    <option value="range">删除连续多页</option>\
                </select>\
            </div>\
            <div class="form-row" id="toolParamSingleRow">\
                <label>页码 <span class="form-note">从 1 开始算</span></label>\
                <input type="number" class="form-input" id="toolParamSingle" value="1" min="1" step="1">\
            </div>\
            <div class="form-row" id="toolParamRangeRow" style="display:none">\
                <label>连续页数</label>\
                <input type="number" class="form-input" id="toolParamRange" value="1" min="1" step="1">\
            </div>\
            <div class="form-row">\
                <label class="checkbox-label">\
                    <input type="checkbox" id="toolParamBack">\
                    从后往前数\
                </label>\
            </div>';
        },
        z: function () {
            return "";
        },
    };

    function gid(id) {
        return app.gid(id);
    }

    function config() {
        return app.config || {};
    }

    function getToolOpenPath() {
        var cfg = config();
        if (cfg.toolOpenPath) {
            return cfg.toolOpenPath;
        }
        return cfg.toolRunPath
            ? cfg.toolRunPath.replace("tool_run", "tool_open")
            : "/__tool_open";
    }

    async function postToolRequest(path, body, signal) {
        var cfg = config();
        var response = await fetch(path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-ComicReader-Token": cfg.shutdownToken || "",
            },
            body: JSON.stringify(body || {}),
            signal: signal,
        });
        if (!response.ok) {
            throw Error(await app.readResponseMessage(response));
        }
        return response;
    }

    async function openToolFolder(folder, button) {
        var originalText = button ? button.textContent : "";
        if (button) {
            button.disabled = true;
            button.textContent = "打开中...";
        }
        try {
            await app.postControlJson(getToolOpenPath(), { folder: folder || "" });
            if (button) {
                button.textContent = "已打开";
                window.setTimeout(function () {
                    button.disabled = false;
                    button.textContent = originalText;
                }, 1000);
            }
        } catch (err) {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
            app.setProgressError("打开目录失败: " + err.message);
        }
    }

    function collectFolders(nodes, result) {
        nodes.forEach(function (node) {
            if (
                node.type === "dir" &&
                node.folder &&
                result.indexOf(node.folder) === -1
            ) {
                result.push(node.folder);
            }
            if (node.children && node.children.length) {
                collectFolders(node.children, result);
            }
        });
    }

    function populateFolderSelect() {
        var select = gid("toolFolderSelect");
        if (!select) {
            return;
        }
        select.innerHTML = "";
        var folders = [""];
        collectFolders(app.tree || [], folders);
        if (folders.indexOf("temp") === -1) {
            folders.unshift("temp");
        }
        folders.sort(function (a, b) {
            if (a === "temp") return -1;
            if (b === "temp") return 1;
            if (!a) return -1;
            if (!b) return 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });
        var tempAdded = false;
        folders.forEach(function (f) {
            var opt = document.createElement("option");
            opt.value = f;
            if (f === "temp") {
                opt.textContent = "📂 temp/ (临时处理目录)";
                opt.selected = true;
                tempAdded = true;
            } else {
                opt.textContent = f ? f : "📂 / (根目录 — 处理所有 PDF)";
            }
            select.appendChild(opt);
        });
        if (!tempAdded) {
            var tempOpt = document.createElement("option");
            tempOpt.value = "temp";
            tempOpt.textContent = "📂 temp/ (临时处理目录)";
            tempOpt.selected = true;
            select.insertBefore(tempOpt, select.firstChild);
        }
    }

    function bindNumberInputGuards(form) {
        form.querySelectorAll('input[type="number"]').forEach(function (input) {
            input.addEventListener("input", function () {
                if (this.validity.badInput) {
                    var prev = this.getAttribute("data-prev");
                    if (prev !== null) this.value = prev;
                } else {
                    this.setAttribute("data-prev", this.value);
                }
            });
            input.addEventListener("blur", function () {
                if (this.value === "") return;
                var val = parseInt(this.value, 10);
                if (isNaN(val)) {
                    this.value = this.getAttribute("data-prev") || "";
                    return;
                }
                var min = parseFloat(this.min);
                var max = parseFloat(this.max);
                if (!isNaN(min) && val < min) this.value = min;
                if (!isNaN(max) && val > max) this.value = max;
                this.setAttribute("data-prev", this.value);
            });
        });
    }

    function bindScaleForm() {
        var presetA4 = gid("toolParamPresetA4");
        var presetCustom = gid("toolParamPresetCustom");
        var wInput = gid("toolParamWidth");
        var hInput = gid("toolParamHeight");
        var stripCheck = gid("toolParamStrip");
        var updating = false;

        function setInputStates() {
            var isStrip = stripCheck.checked;
            var isA4 = presetA4.checked;
            hInput.disabled = isStrip || isA4;
            wInput.disabled = isA4;
        }

        function applyPreset() {
            updating = true;
            if (presetA4.checked) {
                wInput.value = 210;
                hInput.value = 297;
            }
            updating = false;
            setInputStates();
        }

        function onManualChange() {
            if (updating) return;
            if (presetA4.checked) {
                presetA4.checked = false;
                presetCustom.checked = true;
            }
            setInputStates();
        }

        if (presetA4) presetA4.addEventListener("change", applyPreset);
        if (presetCustom) presetCustom.addEventListener("change", applyPreset);
        if (wInput) wInput.addEventListener("input", onManualChange);
        if (hInput) hInput.addEventListener("input", onManualChange);
        if (stripCheck) stripCheck.addEventListener("change", setInputStates);

        applyPreset();
    }

    function bindCropForm() {
        var modeEl = gid("toolParamMode");
        if (!modeEl) {
            return;
        }
        modeEl.addEventListener("change", function () {
            var isSingle = this.value === "single";
            var singleRow = gid("toolParamSingleRow");
            var rangeRow = gid("toolParamRangeRow");
            if (singleRow) singleRow.style.display = isSingle ? "" : "none";
            if (rangeRow) rangeRow.style.display = isSingle ? "none" : "";
        });
    }

    function buildToolForm(tool) {
        var form = gid("toolParamsForm");
        if (!form) {
            return;
        }
        var sectionLabel = form.previousElementSibling;
        var builder = TOOL_FORMS[tool];
        var content = builder ? builder() : "";
        if (content) {
            form.innerHTML = content;
            if (sectionLabel) sectionLabel.style.display = "";
        } else {
            form.innerHTML = "";
            if (sectionLabel) sectionLabel.style.display = "none";
        }
        bindNumberInputGuards(form);
        if (tool === "x") bindScaleForm();
        if (tool === "y") bindCropForm();
    }

    function openToolDialog(tool) {
        activeTool = tool;
        var info = TOOL_INFO[tool] || { name: "未知工具", desc: "" };
        gid("toolDialogTitle").textContent = info.name;
        gid("toolDialogDesc").textContent = info.desc;
        gid("toolOutputWrap").style.display = "none";
        gid("toolResultOutput").textContent = "";
        gid("toolParamsForm").innerHTML = "";
        gid("toolDialogRun").disabled = false;
        gid("toolDialogRun").textContent = "执行";
        gid("toolDialog").style.display = "flex";
        populateFolderSelect();
        buildToolForm(tool);
        window.setTimeout(function () {
            gid("toolDialogRun").focus();
        }, 300);
    }

    function closeToolDialog() {
        gid("toolDialog").style.display = "none";
        activeTool = null;
    }

    function isDialogVisible() {
        var dialog = gid("toolDialog");
        return !!dialog && dialog.style.display === "flex";
    }

    function gatherToolParams(tool) {
        var params = {};
        if (tool === "x") {
            var w = parseFloat(gid("toolParamWidth").value);
            var isStrip = gid("toolParamStrip").checked;
            var h = parseFloat(gid("toolParamHeight").value);
            if (!w || w < 10) {
                app.setProgressError("宽度不能小于 10mm");
                return null;
            }
            if (!isStrip && (!h || h < 10)) {
                app.setProgressError("高度不能小于 10mm");
                return null;
            }
            params.width = w;
            params.height = isStrip ? 297 : h;
            params.strip = isStrip;
        } else if (tool === "y") {
            var mode = gid("toolParamMode").value;
            if (mode === "single") {
                var s = parseInt(gid("toolParamSingle").value, 10);
                if (!s || s < 1) {
                    app.setProgressError("页码必须大于 0");
                    return null;
                }
                params.single = s;
            } else {
                var r = parseInt(gid("toolParamRange").value, 10);
                if (!r || r < 1) {
                    app.setProgressError("页数必须大于 0");
                    return null;
                }
                params.range = r;
            }
            params.back = gid("toolParamBack").checked;
        }
        return params;
    }

    async function streamToolOutput(response, outputEl) {
        var accumulated = "";
        var result = null;
        if (response.body) {
            var decoder = new TextDecoder();
            var reader = response.body.getReader();
            var buffer = "";
            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                buffer += decoder.decode(chunk.value, { stream: true });
                var parts = buffer.split("\n");
                buffer = parts.pop() || "";
                for (var i = 0; i < parts.length; i++) {
                    var line = parts[i].trim();
                    if (!line.startsWith("data: ")) continue;
                    var content = line.slice(6);
                    if (content.startsWith("__RESULT__:")) {
                        result = JSON.parse(content.slice(11));
                    } else {
                        accumulated += content + "\n";
                        outputEl.textContent = accumulated;
                        outputEl.scrollTop = outputEl.scrollHeight;
                    }
                }
            }
        } else {
            var text = await response.text();
            text.split("\n").forEach(function (rawLine) {
                var line = rawLine.trim();
                if (!line.startsWith("data: ")) return;
                var content = line.slice(6);
                if (content.startsWith("__RESULT__:")) {
                    result = JSON.parse(content.slice(11));
                } else {
                    accumulated += content + "\n";
                }
            });
            outputEl.textContent = accumulated;
        }
        return { accumulated: accumulated, result: result };
    }

    async function runTool() {
        if (toolRunning || !activeTool) return;

        var params = gatherToolParams(activeTool);
        if (!params) return;

        var folder = gid("toolFolderSelect").value;
        var outputEl = gid("toolResultOutput");
        var cfg = config();

        toolRunning = true;
        gid("toolDialogRun").disabled = true;
        gid("toolDialogRun").textContent = "执行中...";
        gid("toolDialogCancel").disabled = true;
        gid("toolDialogCancel").textContent = "关闭";
        outputEl.textContent = "";
        gid("toolOutputWrap").style.display = "block";
        window.setTimeout(function () {
            gid("toolOutputWrap").scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }, 50);

        try {
            var startTime = Date.now();
            var abortController = new AbortController();
            app.setActiveJob({
                cancelled: false,
                abortController: abortController,
            });
            var response = await postToolRequest(
                cfg.toolRunPath || "/__tool_run",
                { tool: activeTool, folder: folder, params: params },
                abortController.signal,
            );
            var streamed = await streamToolOutput(response, outputEl);
            var accumulated = streamed.accumulated;
            var result = streamed.result;
            var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            if (result && result.ok) {
                accumulated +=
                    "\n✓ 操作完成，耗时 " +
                    elapsed +
                    " 秒，返回码 " +
                    result.returncode +
                    "\n";
            } else {
                accumulated +=
                    "\n✗ 操作失败，返回码 " +
                    ((result && result.returncode) != null ? result.returncode : "?") +
                    "\n";
            }
            outputEl.textContent = accumulated;
            outputEl.scrollTop = outputEl.scrollHeight;
        } catch (err) {
            if (err.name === "AbortError") {
                gid("toolResultOutput").textContent += "\n⏹ 操作已取消\n";
                return;
            }
            gid("toolResultOutput").textContent +=
                "\n✗ 请求失败: " + err.message + "\n";
        } finally {
            toolRunning = false;
            app.setActiveJob(null);
            gid("toolDialogRun").disabled = false;
            gid("toolDialogRun").textContent = "执行";
            gid("toolDialogCancel").disabled = false;
            gid("toolDialogCancel").textContent = "关闭";
        }
    }

    async function cleanToolBackup() {
        if (!activeTool) return;
        var folder = gid("toolFolderSelect").value;
        var outputEl = gid("toolResultOutput");
        var cfg = config();
        outputEl.textContent = "";
        gid("toolOutputWrap").style.display = "block";
        outputEl.textContent = "正在清理...\n";
        try {
            var response = await postToolRequest(
                cfg.toolRunPath || "/__tool_run",
                {
                    tool: activeTool,
                    folder: folder,
                    params: { clean: true, open_after: false },
                },
            );
            var streamed = await streamToolOutput(response, outputEl);
            outputEl.textContent = streamed.accumulated || outputEl.textContent;
        } catch (err) {
            outputEl.textContent += "清除失败: " + err.message + "\n";
        }
    }

    function bindToolEvents() {
        app.bindClick("toolDialogBackdrop", closeToolDialog);
        app.bindClick("toolDialogCancel", closeToolDialog);
        app.bindClick("toolDialogRun", runTool);
        app.bindClick("toolOutputCopy", function () {
            var text = gid("toolResultOutput").textContent;
            if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
            navigator.clipboard.writeText(text).then(function () {
                gid("toolOutputCopy").textContent = "已复制";
                window.setTimeout(function () {
                    gid("toolOutputCopy").textContent = "复制";
                }, 1500);
            }).catch(function () {});
        });
        app.bindClick("toolDialogOpen", async function () {
            var folder = gid("toolFolderSelect").value;
            await openToolFolder(folder, gid("toolDialogOpen"));
        });
        app.bindClick("toolDialogClean", cleanToolBackup);
    }

    function init() {
        app = window.CatalogApp;
        if (!app) {
            return;
        }
        bindToolEvents();
    }

    window.ToolUI = {
        init: init,
        isDialogVisible: isDialogVisible,
        openDialog: openToolDialog,
        closeDialog: closeToolDialog,
        openFolder: openToolFolder,
    };
})();

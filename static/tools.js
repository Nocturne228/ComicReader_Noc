/**
 * ComicReadScript Tools Module
 *
 * This module handles the tool execution interface, including PDF resizing,
 * page manipulation, and ZIP to PDF conversion tools.
 *
 * @fileoverview Tool management and execution logic.
 */
(function () {
    "use strict";

    /** @type {Object|null} Application state */
    var app = null;
    /** @type {string|null} Currently active tool */
    var activeTool = null;
    /** @type {boolean} Whether a tool is currently running */
    var toolRunning = false;

    /**
     * Tool information and descriptions.
     * @type {Object.<string, {name: string, desc: string}>}
     */
    var TOOL_INFO = {
        x: {
            name: "PDF尺寸缩放",
            desc: "统一 PDF 页面尺寸，默认处理选中目录下所有 PDF，原文件备份到 x_backup",
        },
        y: {
            name: "PDF页面裁剪",
            desc: "删除 PDF 指定页面，默认处理选中目录下所有 PDF，原文件备份到 y_backup",
        },
        z: {
            name: "ZIP转PDF",
            desc: "将 ZIP 压缩包解压并合成为 PDF，默认处理选中目录下所有 ZIP",
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
            </div>\
            <div class="form-row">\
                <label>指定 PDF 文件 <span class="form-note">可选，相对目标目录</span></label>\
                <select class="form-select" id="toolParamFile"></select>\
            </div>';
        },
        y: function () {
            return '\
            <div class="form-row">\
                <label>处理方式</label>\
                <select class="form-select" id="toolParamMode">\
                    <option value="single">删除指定单页</option>\
                    <option value="range">删除连续多页</option>\
                    <option value="extractPng">提取单页为 PNG</option>\
                    <option value="extractPdf">提取页码范围为 PDF</option>\
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
            <div class="form-row" id="toolParamBackRow">\
                <label class="checkbox-label">\
                    <input type="checkbox" id="toolParamBack">\
                    从后往前数\
                </label>\
            </div>\
            <div class="form-row" id="toolParamFileRow">\
                <label>指定 PDF 文件 <span class="form-note">删除时可选，提取时必填；相对目标目录</span></label>\
                <select class="form-select" id="toolParamFile"></select>\
            </div>\
            <div class="form-row" id="toolParamExtractPageRow" style="display:none">\
                <label>提取页码 <span class="form-note">从 1 开始算</span></label>\
                <input type="number" class="form-input" id="toolParamExtractPage" value="1" min="1" step="1">\
            </div>\
            <div class="form-row" id="toolParamExtractRangeRow" style="display:none">\
                <label>提取范围 <span class="form-note">包含起止页</span></label>\
                <div class="form-row-inline compact">\
                    <input type="number" class="form-input" id="toolParamExtractStart" value="1" min="1" step="1">\
                    <span class="form-unit">至</span>\
                    <input type="number" class="form-input" id="toolParamExtractEnd" value="1" min="1" step="1">\
                </div>\
            </div>\
            <div class="form-row" id="toolParamDpiRow" style="display:none">\
                <label>PNG DPI</label>\
                <input type="number" class="form-input" id="toolParamDpi" value="300" min="72" max="1200" step="1">\
            </div>\
            <div class="form-row" id="toolParamOutputRow" style="display:none">\
                <label>输出文件名 <span class="form-note">可选</span></label>\
                <input type="text" class="form-input" id="toolParamOutput" placeholder="留空自动生成">\
            </div>';
        },
        z: function () {
            return '\
            <div class="form-row">\
                <label>DPI 预设</label>\
                <div class="radio-group">\
                    <label class="radio-label">\
                        <input type="radio" name="dpiMode" value="bw" id="toolParamDpiBw" checked>\
                        黑白 600 DPI\
                    </label>\
                    <label class="radio-label">\
                        <input type="radio" name="dpiMode" value="color" id="toolParamDpiColor">\
                        彩色 300 DPI\
                    </label>\
                </div>\
            </div>\
            <div class="form-row">\
                <label>指定 ZIP 文件 <span class="form-note">可选，相对目标目录</span></label>\
                <select class="form-select" id="toolParamFile"></select>\
            </div>';
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

    function getToolFilesPath() {
        var cfg = config();
        return cfg.toolFilesPath || "/__tool_files";
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

    async function openToolFolder(folder, button, scope) {
        var originalText = button ? button.textContent : "";
        if (button) {
            button.disabled = true;
            button.textContent = "打开中...";
        }
        try {
            await app.postControlJson(getToolOpenPath(), {
                scope: scope || "workspace",
                folder: folder || "",
            });
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

    function getFileEmptyLabel(tool) {
        if (tool === "z") {
            return "全部 ZIP（批量处理）";
        }
        if (tool === "y") {
            var modeEl = gid("toolParamMode");
            var mode = modeEl ? modeEl.value : "single";
            if (mode === "extractPng" || mode === "extractPdf") {
                return "请选择 PDF 文件";
            }
        }
        return "全部 PDF（批量处理）";
    }

    function setFileSelectOptions(select, tool, files, loadingText) {
        if (!select) return;
        select.innerHTML = "";
        var emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = loadingText || getFileEmptyLabel(tool);
        select.appendChild(emptyOpt);
        (files || []).forEach(function (file) {
            var opt = document.createElement("option");
            opt.value = file;
            opt.textContent = file;
            select.appendChild(opt);
        });
    }

    function updateFileSelectEmptyLabel(tool) {
        var select = gid("toolParamFile");
        if (!select || !select.options.length) return;
        select.options[0].textContent = getFileEmptyLabel(tool);
    }

    async function refreshToolFileSelect() {
        if (!activeTool) return;
        var requestTool = activeTool;
        var select = gid("toolParamFile");
        if (!select) return;
        var folderSelect = gid("toolFolderSelect");
        if (!folderSelect) return;

        var target = decodeFolderValue(folderSelect.value);
        setFileSelectOptions(select, activeTool, [], "正在搜索文件...");
        select.disabled = true;
        try {
            var response = await postToolRequest(getToolFilesPath(), {
                tool: requestTool,
                scope: target.scope,
                folder: target.folder,
            });
            var data = await response.json();
            var files = data && data.files ? data.files : [];
            if (activeTool !== requestTool) return;
            setFileSelectOptions(select, requestTool, files);
        } catch (err) {
            if (activeTool !== requestTool) return;
            setFileSelectOptions(select, requestTool, [], "文件列表加载失败");
        } finally {
            if (activeTool !== requestTool) return;
            select.disabled = false;
            updateFileSelectEmptyLabel(requestTool);
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

    function encodeFolderValue(scope, folder) {
        return (scope || "workspace") + "|" + (folder || "");
    }

    function decodeFolderValue(value) {
        var parts = String(value || "workspace|temp").split("|");
        return { scope: parts[0] || "workspace", folder: parts.slice(1).join("|") || "" };
    }

    function populateFolderSelect() {
        var select = gid("toolFolderSelect");
        if (!select) {
            return;
        }
        select.innerHTML = "";
        var groups = config().toolFolderGroups || [];
        if (!groups.length) {
            var folders = [""];
            collectFolders(app.tree || [], folders);
            groups = [{ label: "漫画库", folders: folders.map(function (folder) {
                return { scope: "library", folder: folder, label: folder || "/" };
            }) }];
        }
        groups.forEach(function (group) {
            var optgroup = document.createElement("optgroup");
            optgroup.label = group.label || "";
            (group.folders || []).forEach(function (entry) {
                var opt = document.createElement("option");
                opt.value = encodeFolderValue(entry.scope, entry.folder);
                opt.textContent = entry.label || entry.folder || "/";
                if (entry.scope === "workspace" && (entry.folder || "") === "temp") {
                    opt.selected = true;
                }
                optgroup.appendChild(opt);
            });
            select.appendChild(optgroup);
        });
        if (!select.value && select.options.length) {
            select.options[0].selected = true;
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
        function syncMode() {
            var mode = modeEl.value;
            var isSingle = mode === "single";
            var isRange = mode === "range";
            var isExtractPng = mode === "extractPng";
            var isExtractPdf = mode === "extractPdf";
            var singleRow = gid("toolParamSingleRow");
            var rangeRow = gid("toolParamRangeRow");
            var backRow = gid("toolParamBackRow");
            var fileRow = gid("toolParamFileRow");
            var pageRow = gid("toolParamExtractPageRow");
            var extractRangeRow = gid("toolParamExtractRangeRow");
            var dpiRow = gid("toolParamDpiRow");
            var outputRow = gid("toolParamOutputRow");
            if (singleRow) singleRow.style.display = isSingle ? "" : "none";
            if (rangeRow) rangeRow.style.display = isRange ? "" : "none";
            if (backRow) backRow.style.display = (isSingle || isRange) ? "" : "none";
            if (fileRow) fileRow.style.display = "";
            updateFileSelectEmptyLabel("y");
            if (pageRow) pageRow.style.display = isExtractPng ? "" : "none";
            if (extractRangeRow) extractRangeRow.style.display = isExtractPdf ? "" : "none";
            if (dpiRow) dpiRow.style.display = isExtractPng ? "" : "none";
            if (outputRow) outputRow.style.display = (isExtractPng || isExtractPdf) ? "" : "none";
        }
        modeEl.addEventListener("change", syncMode);
        syncMode();
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
        refreshToolFileSelect();
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
            var scaleFile = gid("toolParamFile").value.trim();
            if (scaleFile) {
                params.file = scaleFile;
            }
        } else if (tool === "y") {
            var mode = gid("toolParamMode").value;
            if (mode === "single") {
                var s = parseInt(gid("toolParamSingle").value, 10);
                if (!s || s < 1) {
                    app.setProgressError("页码必须大于 0");
                    return null;
                }
                params.single = s;
                params.back = gid("toolParamBack").checked;
            } else if (mode === "range") {
                var r = parseInt(gid("toolParamRange").value, 10);
                if (!r || r < 1) {
                    app.setProgressError("页数必须大于 0");
                    return null;
                }
                params.range = r;
                params.back = gid("toolParamBack").checked;
            } else if (mode === "extractPng") {
                var fileForPng = gid("toolParamFile").value.trim();
                var page = parseInt(gid("toolParamExtractPage").value, 10);
                var dpi = parseInt(gid("toolParamDpi").value, 10);
                if (!fileForPng) {
                    app.setProgressError("请填写 PDF 文件名或相对路径");
                    return null;
                }
                if (!page || page < 1) {
                    app.setProgressError("提取页码必须大于 0");
                    return null;
                }
                if (!dpi || dpi < 72) {
                    app.setProgressError("DPI 不能小于 72");
                    return null;
                }
                params.mode = "extract_png";
                params.file = fileForPng;
                params.page = page;
                params.dpi = dpi;
            } else if (mode === "extractPdf") {
                var fileForPdf = gid("toolParamFile").value.trim();
                var start = parseInt(gid("toolParamExtractStart").value, 10);
                var end = parseInt(gid("toolParamExtractEnd").value, 10);
                if (!fileForPdf) {
                    app.setProgressError("请填写 PDF 文件名或相对路径");
                    return null;
                }
                if (!start || !end || start < 1 || end < start) {
                    app.setProgressError("请输入有效的提取页码范围");
                    return null;
                }
                params.mode = "extract_pdf";
                params.file = fileForPdf;
                params.start = start;
                params.end = end;
            }
            var output = gid("toolParamOutput");
            if (output && output.value.trim()) {
                params.output = output.value.trim();
            }
            var deleteFile = gid("toolParamFile").value.trim();
            if ((mode === "single" || mode === "range") && deleteFile) {
                params.file = deleteFile;
            }
        } else if (tool === "z") {
            var dpiMode = document.querySelector('input[name="dpiMode"]:checked');
            params.dpiMode = dpiMode ? dpiMode.value : "bw";
            var zipFile = gid("toolParamFile").value.trim();
            if (zipFile) {
                params.file = zipFile;
            }
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
        var target = decodeFolderValue(folder);
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
                {
                    tool: activeTool,
                    scope: target.scope,
                    folder: target.folder,
                    params: params,
                },
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
        var target = decodeFolderValue(folder);
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
                    scope: target.scope,
                    folder: target.folder,
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
            var target = decodeFolderValue(gid("toolFolderSelect").value);
            await openToolFolder(target.folder, gid("toolDialogOpen"), target.scope);
        });
        app.bindClick("toolDialogClean", cleanToolBackup);
        var folderSelect = gid("toolFolderSelect");
        if (folderSelect) {
            folderSelect.addEventListener("change", refreshToolFileSelect);
        }
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

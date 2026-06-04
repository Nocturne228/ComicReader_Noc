/**
 * Page notes module for reader navigation notes.
 */
(function () {
    "use strict";

    var CONFIG = window.CATALOG_CONFIG || {};
    var enabled = CONFIG.pageNotesEnabled === true && CONFIG.serverControl === true;
    var data = normalizeData(CONFIG.pageNotesData || { version: 1, pdfs: {} });
    var currentPdf = null;
    var currentTitle = "";
    var currentPageCount = 0;
    var getReader = null;
    var getCurrentPages = null;
    var jumpToPage = null;

    function gid(id) {
        return document.getElementById(id);
    }

    function normalizeNote(note) {
        if (!note || typeof note !== "object") return null;
        var page = parseInt(note.page, 10);
        if (!page || page < 1) return null;
        return {
            id: String(note.id || ""),
            page: page,
            title: String(note.title || "").trim(),
            body: String(note.body || "").trim(),
            tags: Array.isArray(note.tags) ? note.tags : [],
            createdAt: parseInt(note.createdAt, 10) || 0,
            updatedAt: parseInt(note.updatedAt, 10) || 0,
        };
    }

    function normalizeEntry(entry) {
        var notes = [];
        if (Array.isArray(entry)) {
            entry.forEach(function (note) {
                var normalized = normalizeNote(note);
                if (normalized) notes.push(normalized);
            });
            return { notes: sortNotes(notes) };
        }
        if (entry && typeof entry === "object") {
            (Array.isArray(entry.notes) ? entry.notes : []).forEach(function (note) {
                var normalized = normalizeNote(note);
                if (normalized) notes.push(normalized);
            });
            var result = { notes: sortNotes(notes) };
            var lastReadPage = parseInt(entry.lastReadPage, 10);
            if (lastReadPage > 0) result.lastReadPage = lastReadPage;
            var lastReadAt = parseInt(entry.lastReadAt, 10);
            if (lastReadAt > 0) result.lastReadAt = lastReadAt;
            return result;
        }
        return { notes: [] };
    }

    function normalizeData(raw) {
        var pdfs = {};
        if (raw && raw.pdfs && typeof raw.pdfs === "object") {
            Object.keys(raw.pdfs).forEach(function (pdf) {
                pdfs[pdf] = normalizeEntry(raw.pdfs[pdf]);
            });
        }
        return { version: 1, pdfs: pdfs };
    }

    function sortNotes(notes) {
        return notes.slice().sort(function (a, b) {
            return a.page - b.page || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
        });
    }

    function getEntry(pdf) {
        if (!pdf) return { notes: [] };
        if (!data.pdfs[pdf]) data.pdfs[pdf] = { notes: [] };
        return data.pdfs[pdf];
    }

    function bringControlsToFront() {
        ["readerNotesToggle", "readerNotesPanel"].forEach(function (id) {
            var el = gid(id);
            if (el && el.parentNode === document.body) {
                document.body.appendChild(el);
            }
        });
    }

    function headers() {
        return {
            "Content-Type": "application/json",
            "X-ComicReader-Token": CONFIG.shutdownToken || "",
        };
    }

    function post(path, body) {
        return fetch(path, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(body || {}),
        }).then(function (response) {
            if (!response.ok) {
                return response.json().then(function (payload) {
                    throw Error((payload && payload.message) || ("HTTP " + response.status));
                }).catch(function () {
                    throw Error("HTTP " + response.status);
                });
            }
            return response.json();
        });
    }

    function refreshPdf(pdf) {
        if (!enabled || !pdf) return Promise.resolve(getEntry(pdf));
        return post(CONFIG.pageNotesGetPath || "/__page_notes_get", { pdf: pdf })
            .then(function (entry) {
                data.pdfs[pdf] = normalizeEntry(entry);
                render();
                return data.pdfs[pdf];
            });
    }

    function escapeHtml(value) {
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function formatTime(ts) {
        if (!ts) return "";
        var date = new Date(ts * 1000);
        if (isNaN(date.getTime())) return "";
        return date.getFullYear() + "-" +
            String(date.getMonth() + 1).padStart(2, "0") + "-" +
            String(date.getDate()).padStart(2, "0") + " " +
            String(date.getHours()).padStart(2, "0") + ":" +
            String(date.getMinutes()).padStart(2, "0");
    }

    function currentFirstPage() {
        if (typeof getCurrentPages !== "function") return 1;
        var pages = getCurrentPages() || [];
        return pages.length ? pages[0] : 1;
    }

    function fillForm(note) {
        gid("readerNoteId").value = note ? note.id : "";
        gid("readerNotePage").value = note ? note.page : currentFirstPage();
        gid("readerNoteTitle").value = note ? note.title : "";
        gid("readerNoteBody").value = note ? note.body : "";
        gid("readerNoteTitle").focus();
    }

    function clearForm() {
        fillForm(null);
    }

    function renderLastRead(entry) {
        var box = gid("readerNotesLast");
        var btn = gid("readerNotesLastJump");
        var time = gid("readerNotesLastTime");
        if (!box || !btn || !time) return;
        if (!entry.lastReadPage) {
            box.style.display = "none";
            return;
        }
        box.style.display = "";
        btn.textContent = "P" + entry.lastReadPage;
        btn.dataset.page = String(entry.lastReadPage);
        time.textContent = formatTime(entry.lastReadAt);
    }

    function render() {
        if (!currentPdf) return;
        var entry = getEntry(currentPdf);
        var title = gid("readerNotesTitle");
        var subtitle = gid("readerNotesSubtitle");
        var list = gid("readerNotesList");
        if (title) title.textContent = "页码笔记";
        if (subtitle) subtitle.textContent = currentTitle || currentPdf;
        renderLastRead(entry);
        if (!list) return;
        if (!entry.notes.length) {
            list.innerHTML = '<div class="reader-note-empty">暂无页码笔记</div>';
            return;
        }
        list.innerHTML = entry.notes.map(function (note) {
            var fallbackTitle = note.body ? note.body.split("\n")[0] : "无标题笔记";
            return '' +
                '<article class="reader-note-item" data-id="' + escapeHtml(note.id) + '" data-page="' + note.page + '">' +
                    '<button type="button" class="reader-note-main" data-action="jump">' +
                        '<span class="reader-note-page">P' + note.page + '</span>' +
                        '<span>' +
                            '<span class="reader-note-title">' + escapeHtml(note.title || fallbackTitle) + '</span>' +
                            (note.body ? '<span class="reader-note-body">' + escapeHtml(note.body) + '</span>' : '') +
                        '</span>' +
                    '</button>' +
                    '<div class="reader-note-actions">' +
                        '<button type="button" data-action="edit">编辑</button>' +
                        '<button type="button" data-action="delete">删除</button>' +
                    '</div>' +
                '</article>';
        }).join("");
    }

    function openPanel() {
        if (!enabled || !currentPdf) return;
        bringControlsToFront();
        var panel = gid("readerNotesPanel");
        var toggle = gid("readerNotesToggle");
        if (panel) panel.style.display = "flex";
        if (toggle) toggle.classList.add("active");
        refreshPdf(currentPdf).catch(function () {
            render();
        });
    }

    function closePanel() {
        var panel = gid("readerNotesPanel");
        var toggle = gid("readerNotesToggle");
        if (panel) panel.style.display = "none";
        if (toggle) toggle.classList.remove("active");
    }

    function togglePanel() {
        var panel = gid("readerNotesPanel");
        if (panel && panel.style.display === "flex") closePanel();
        else openPanel();
    }

    function showReaderControls(show) {
        if (show) bringControlsToFront();
        var toggle = gid("readerNotesToggle");
        if (toggle) toggle.style.display = show && enabled ? "" : "none";
        if (!show) closePanel();
    }

    function setReaderContext(ctx) {
        currentPdf = ctx && ctx.pdf ? ctx.pdf : null;
        currentTitle = ctx && ctx.title ? ctx.title : "";
        currentPageCount = ctx && ctx.pageCount ? ctx.pageCount : 0;
        showReaderControls(Boolean(currentPdf));
        clearForm();
        render();
        if (currentPdf) {
            refreshPdf(currentPdf).catch(function () {});
        }
    }

    function jumpPage(page) {
        page = parseInt(page, 10);
        if (!page || page < 1) return;
        if (typeof jumpToPage === "function") {
            jumpToPage(page);
        }
    }

    function saveNote(event) {
        event.preventDefault();
        if (!enabled || !currentPdf) return;
        var page = parseInt(gid("readerNotePage").value, 10);
        if (!page || page < 1) return;
        if (currentPageCount && page > currentPageCount) page = currentPageCount;
        var note = {
            id: gid("readerNoteId").value.trim(),
            page: page,
            title: gid("readerNoteTitle").value.trim(),
            body: gid("readerNoteBody").value.trim(),
            tags: [],
        };
        post(CONFIG.pageNoteUpsertPath || "/__page_note_upsert", {
            pdf: currentPdf,
            note: note,
        }).then(function (entry) {
            data.pdfs[currentPdf] = normalizeEntry(entry);
            clearForm();
            render();
        });
    }

    function deleteNote(noteId) {
        if (!enabled || !currentPdf || !noteId) return;
        post(CONFIG.pageNoteDeletePath || "/__page_note_delete", {
            pdf: currentPdf,
            id: noteId,
        }).then(function (entry) {
            data.pdfs[currentPdf] = normalizeEntry(entry);
            render();
        });
    }

    function recordLastRead() {
        if (!enabled || !currentPdf) return Promise.resolve();
        var page = currentFirstPage();
        if (!page || page < 1) return Promise.resolve();
        return post(CONFIG.pageNoteLastReadPath || "/__page_note_last_read", {
            pdf: currentPdf,
            page: page,
        }).then(function (entry) {
            data.pdfs[currentPdf] = normalizeEntry(entry);
            render();
        }).catch(function () {});
    }

    function openForPdf(pdf, title) {
        currentPdf = pdf;
        currentTitle = title || pdf;
        currentPageCount = 0;
        openPanel();
    }

    function init(options) {
        options = options || {};
        getReader = options.getReader || null;
        getCurrentPages = options.getCurrentPages || null;
        jumpToPage = options.jumpToPage || null;

        var toggle = gid("readerNotesToggle");
        var close = gid("readerNotesClose");
        var form = gid("readerNotesForm");
        var reset = gid("readerNoteReset");
        var list = gid("readerNotesList");
        var lastJump = gid("readerNotesLastJump");

        if (toggle) toggle.addEventListener("click", togglePanel);
        if (close) close.addEventListener("click", closePanel);
        if (form) form.addEventListener("submit", saveNote);
        if (reset) reset.addEventListener("click", clearForm);
        if (lastJump) {
            lastJump.addEventListener("click", function () {
                jumpPage(this.dataset.page);
            });
        }
        if (list) {
            list.addEventListener("click", function (event) {
                var actionEl = event.target.closest("[data-action]");
                var item = event.target.closest(".reader-note-item");
                if (!actionEl || !item) return;
                var noteId = item.dataset.id;
                var page = parseInt(item.dataset.page, 10);
                var entry = getEntry(currentPdf);
                var note = entry.notes.find(function (candidate) {
                    return candidate.id === noteId;
                });
                if (actionEl.dataset.action === "jump") {
                    jumpPage(page);
                } else if (actionEl.dataset.action === "edit" && note) {
                    fillForm(note);
                } else if (actionEl.dataset.action === "delete") {
                    deleteNote(noteId);
                }
            });
        }
    }

    window.PageNotes = {
        init: init,
        setReaderContext: setReaderContext,
        showReaderControls: showReaderControls,
        openPanel: openPanel,
        closePanel: closePanel,
        openForPdf: openForPdf,
        recordLastRead: recordLastRead,
        render: render,
        getEntry: getEntry,
    };
})();

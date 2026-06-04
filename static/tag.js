/**
 * Tag system module for ComicReadScript catalog.
 * Handles tag data fetching, CRUD operations, and UI interactions.
 */
(function() {
    "use strict";

    var CONFIG = window.CATALOG_CONFIG || {};
    var TAG_EDIT_ENABLED = CONFIG.tagsEnabled === true && CONFIG.serverControl === true;
    var TAG_DATA = normalizeData(CONFIG.tagsData || { tags: [], pdfs: {} });
    var listeners = [];

    function normalizeTags(tags) {
        if (!Array.isArray(tags)) return [];
        var result = [];
        var seen = {};
        for (var i = 0; i < tags.length; i++) {
            if (typeof tags[i] !== "string") continue;
            var tag = tags[i].trim();
            if (!tag || seen[tag]) continue;
            result.push(tag);
            seen[tag] = true;
        }
        return result;
    }

    function normalizeData(data) {
        var pdfs = {};
        var allTags = {};
        if (data && data.pdfs && typeof data.pdfs === "object") {
            Object.keys(data.pdfs).forEach(function(path) {
                if (!path) return;
                var tags = normalizeTags(data.pdfs[path]);
                if (!tags.length) return;
                pdfs[path] = tags;
                tags.forEach(function(tag) { allTags[tag] = true; });
            });
        }
        return { tags: Object.keys(allTags).sort(), pdfs: pdfs };
    }

    function getHeaders() {
        return {
            "Content-Type": "application/json",
            "X-ComicReader-Token": CONFIG.shutdownToken || ""
        };
    }

    function readResponseMessage(response) {
        return response.clone().json()
            .then(function(data) {
                return (data && data.message) || ("HTTP " + response.status);
            })
            .catch(function() {
                return response.text().then(function(text) {
                    return text || ("HTTP " + response.status);
                });
            });
    }

    function postJson(path, body) {
        if (!TAG_EDIT_ENABLED && path !== (CONFIG.tagsGetPath || "/__tags_get")) {
            return Promise.reject(new Error("标签编辑需要通过 --serve 启动本地服务"));
        }
        return fetch(path, {
            method: "POST",
            headers: getHeaders(),
            body: body ? JSON.stringify(body) : undefined
        }).then(function(response) {
            if (!response.ok) {
                return readResponseMessage(response).then(function(message) {
                    throw new Error(message);
                });
            }
            return response.json();
        });
    }

    function normalizePdfPath(pdfPath) {
        if (!pdfPath) return "";
        try {
            var url = new URL(pdfPath, location.href);
            var decoded = decodeURIComponent(url.pathname);
            return decoded.replace(/^\/+/, "");
        } catch(e) {
            var stripped = pdfPath.replace(/^\.\.\/+/, "");
            try { return decodeURIComponent(stripped); } catch(e2) { return stripped; }
        }
    }

    function fetchTags() {
        if (!TAG_EDIT_ENABLED) {
            notifyListeners();
            return Promise.resolve(TAG_DATA);
        }
        return postJson(CONFIG.tagsGetPath || "/__tags_get")
        .then(function(data) {
            if (data && data.tags) {
                TAG_DATA = normalizeData(data);
                notifyListeners();
            }
            return TAG_DATA;
        });
    }

    function updatePdfTags(pdfPath, tags) {
        var key = normalizePdfPath(pdfPath);
        return postJson(CONFIG.tagUpdatePath || "/__tag_update", {
            pdf: key,
            tags: normalizeTags(tags)
        })
        .then(function(data) {
            if (data && data.ok) {
                TAG_DATA = normalizeData(data);
                notifyListeners();
            }
            return data;
        });
    }

    function renameTag(oldName, newName) {
        return postJson(CONFIG.tagRenamePath || "/__tag_rename", {
            old: oldName,
            new: newName
        })
        .then(function(data) {
            if (data && data.ok) {
                TAG_DATA = normalizeData(data);
                notifyListeners();
            }
            return data;
        });
    }

    function deleteTag(tagName) {
        return postJson(CONFIG.tagDeletePath || "/__tag_delete", { tag: tagName })
        .then(function(data) {
            if (data && data.ok) {
                TAG_DATA = normalizeData(data);
                notifyListeners();
            }
            return data;
        });
    }

    function getPdfTags(pdfPath) {
        var key = normalizePdfPath(pdfPath);
        return TAG_DATA.pdfs[key] || TAG_DATA.pdfs[pdfPath] || [];
    }

    function getAllTags() {
        return TAG_DATA.tags || [];
    }

    function getTagCounts() {
        var counts = {};
        var pdfs = TAG_DATA.pdfs || {};
        for (var path in pdfs) {
            var tags = pdfs[path];
            for (var i = 0; i < tags.length; i++) {
                var tag = tags[i];
                counts[tag] = (counts[tag] || 0) + 1;
            }
        }
        return counts;
    }

    function parseSearchQuery(query) {
        var tags = [];
        var titleParts = [];
        var parts = query.split(/\s+/);
        for (var i = 0; i < parts.length; i++) {
            var word = parts[i];
            if (word.indexOf(":") === 0 && word.length > 1) {
                tags.push(word.slice(1));
            } else if (word) {
                titleParts.push(word);
            }
        }
        return { tags: tags, title: titleParts.join(" ").toLowerCase() };
    }

    function matchesTagFilter(pdfPath, filterTags) {
        if (!filterTags || filterTags.length === 0) return true;
        var pdfTags = getPdfTags(pdfPath);
        for (var i = 0; i < filterTags.length; i++) {
            if (pdfTags.indexOf(filterTags[i]) === -1) return false;
        }
        return true;
    }

    function onChange(callback) {
        listeners.push(callback);
    }

    function notifyListeners() {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](TAG_DATA); } catch(e) {}
        }
    }

    window.TagManager = {
        fetch: fetchTags,
        updatePdfTags: updatePdfTags,
        renameTag: renameTag,
        deleteTag: deleteTag,
        getPdfTags: getPdfTags,
        getAllTags: getAllTags,
        getTagCounts: getTagCounts,
        parseSearchQuery: parseSearchQuery,
        matchesTagFilter: matchesTagFilter,
        onChange: onChange,
        canEdit: function() { return TAG_EDIT_ENABLED; },
        getData: function() { return TAG_DATA; }
    };
})();

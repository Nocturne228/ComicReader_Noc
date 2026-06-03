/**
 * Tag system module for ComicReadScript catalog.
 * Handles tag data fetching, CRUD operations, and UI interactions.
 */
(function() {
    "use strict";

    var CONFIG = window.CATALOG_CONFIG || {};
    var TAG_DATA = { tags: [], pdfs: {} };
    var listeners = [];

    function getHeaders() {
        return {
            "Content-Type": "application/json",
            "X-ComicReader-Token": CONFIG.shutdownToken || ""
        };
    }

    function fetchTags() {
        return fetch(CONFIG.tagsGetPath || "/__tags_get", {
            method: "POST",
            headers: getHeaders()
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.tags) {
                TAG_DATA = data;
            }
            return TAG_DATA;
        })
        .catch(function() {
            return TAG_DATA;
        });
    }

    function updatePdfTags(pdfPath, tags) {
        return fetch(CONFIG.tagUpdatePath || "/__tag_update", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ pdf: pdfPath, tags: tags })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.ok) {
                TAG_DATA.tags = data.tags || TAG_DATA.tags;
                TAG_DATA.pdfs = data.pdfs || TAG_DATA.pdfs;
                notifyListeners();
            }
            return data;
        });
    }

    function renameTag(oldName, newName) {
        return fetch(CONFIG.tagRenamePath || "/__tag_rename", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ old: oldName, new: newName })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.ok) {
                TAG_DATA.tags = data.tags || TAG_DATA.tags;
                TAG_DATA.pdfs = data.pdfs || TAG_DATA.pdfs;
                notifyListeners();
            }
            return data;
        });
    }

    function deleteTag(tagName) {
        return fetch(CONFIG.tagDeletePath || "/__tag_delete", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ tag: tagName })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.ok) {
                TAG_DATA.tags = data.tags || TAG_DATA.tags;
                TAG_DATA.pdfs = data.pdfs || TAG_DATA.pdfs;
                notifyListeners();
            }
            return data;
        });
    }

    function getPdfTags(pdfPath) {
        return TAG_DATA.pdfs[pdfPath] || [];
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
        getData: function() { return TAG_DATA; }
    };
})();

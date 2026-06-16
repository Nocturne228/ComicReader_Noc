import { gid } from "./utils.js";

var READ_KEY = "@readPdfs";
var FAV_KEY = "@favoritePdfs";

function getSet(key) {
    try {
        var data = JSON.parse(localStorage.getItem(key));
        return new Set(Array.isArray(data) ? data : []);
    } catch (e) {
        return new Set();
    }
}

function saveSet(key, s) {
    localStorage.setItem(key, JSON.stringify(Array.from(s)));
}

export function isRead(pdfPath) {
    return getSet(READ_KEY).has(pdfPath);
}

export function markRead(pdfPath) {
    var s = getSet(READ_KEY);
    s.add(pdfPath);
    saveSet(READ_KEY, s);
    applyReadState(pdfPath, true);
}

export function isFavorite(pdfPath) {
    return getSet(FAV_KEY).has(pdfPath);
}

export function toggleFavorite(pdfPath) {
    var s = getSet(FAV_KEY);
    if (s.has(pdfPath)) {
        s.delete(pdfPath);
    } else {
        s.add(pdfPath);
    }
    saveSet(FAV_KEY, s);
    applyFavoriteState(pdfPath, s.has(pdfPath));
    return s.has(pdfPath);
}

function applyReadState(pdfPath, read) {
    var card = document.querySelector('.card[data-pdf="' + CSS.escape(pdfPath) + '"]');
    if (card) card.classList.toggle("read", read);
}

function applyFavoriteState(pdfPath, fav) {
    var card = document.querySelector('.card[data-pdf="' + CSS.escape(pdfPath) + '"]');
    if (card) {
        card.classList.toggle("favorite", fav);
        var btn = card.querySelector(".fav-btn");
        if (btn) btn.classList.toggle("active", fav);
    }
}

export function initMarks() {
    var readSet = getSet(READ_KEY);
    var favSet = getSet(FAV_KEY);

    document.querySelectorAll(".card").forEach(function (card) {
        var pdfPath = card.dataset.pdf || "";
        if (readSet.has(pdfPath)) card.classList.add("read");
        if (favSet.has(pdfPath)) {
            card.classList.add("favorite");
            var btn = card.querySelector(".fav-btn");
            if (btn) btn.classList.add("active");
        }
    });

    document.querySelectorAll(".fav-btn").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var card = btn.closest(".card");
            if (!card) return;
            toggleFavorite(card.dataset.pdf || "");
        });
    });
}

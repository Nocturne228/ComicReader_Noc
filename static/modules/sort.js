import { lsSet } from "./utils.js";

function sortCards(compare) {
    document.querySelectorAll(".folder-grid").forEach(function (grid) {
        Array.from(grid.querySelectorAll(".card"))
            .sort(compare)
            .forEach(function (card) { grid.appendChild(card); });
    });
}

export function sortByName() {
    sortCards(function (a, b) {
        return a.dataset.title.localeCompare(b.dataset.title, undefined, { numeric: true });
    });
}

export function sortByTime() {
    sortCards(function (a, b) {
        return Number(b.dataset.mtime) - Number(a.dataset.mtime);
    });
}

export function onSortChange(value) {
    if (value === "time") {
        sortByTime();
    } else {
        sortByName();
    }
    lsSet("@catalogSort", value);
}

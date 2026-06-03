/**
 * 排序模块
 * 负责卡片的排序功能
 */
var Sort = (function () {
    "use strict";

    function sortCards(compare) {
        document.querySelectorAll(".folder-grid").forEach(function (grid) {
            Array.from(grid.querySelectorAll(".card"))
                .sort(compare)
                .forEach(function (card) {
                    grid.appendChild(card);
                });
        });
    }

    function sortByName() {
        sortCards(function (a, b) {
            return a.dataset.title.localeCompare(b.dataset.title);
        });
    }

    function sortByTime() {
        sortCards(function (a, b) {
            return Number(b.dataset.mtime) - Number(a.dataset.mtime);
        });
    }

    function onSortChange(value) {
        if (value === "time") {
            sortByTime();
        } else {
            sortByName();
        }
        Utils.lsSet("@catalogSort", value);
    }

    return {
        sortCards: sortCards,
        sortByName: sortByName,
        sortByTime: sortByTime,
        onSortChange: onSortChange,
    };
})();

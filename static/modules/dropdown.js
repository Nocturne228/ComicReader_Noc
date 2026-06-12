function closeAllDropdowns() {
    document.querySelectorAll(".dropdown-menu.show").forEach(function (menu) {
        menu.classList.remove("show");
    });
    document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(function (toggle) {
        toggle.setAttribute("aria-expanded", "false");
    });
}

function toggleDropdown(btn) {
    var container = btn.closest(".dropdown");
    if (!container) return;
    var menu = container.querySelector(".dropdown-menu");
    if (!menu) return;
    var isOpen = menu.classList.contains("show");
    closeAllDropdowns();
    if (!isOpen) {
        menu.classList.add("show");
        btn.setAttribute("aria-expanded", "true");
    }
}

export function initDropdowns() {
    var toolbar = document.querySelector(".toolbar");
    if (toolbar) {
        toolbar.addEventListener("click", function (e) {
            var toggleBtn = e.target.closest(".dropdown-toggle");
            if (toggleBtn) {
                e.preventDefault();
                e.stopPropagation();
                toggleDropdown(toggleBtn);
                return;
            }
            var dropdownItem = e.target.closest(".dropdown-item");
            if (dropdownItem) {
                e.stopPropagation();
                closeAllDropdowns();
                return;
            }
        });
    }
    document.addEventListener("click", function (e) {
        if (e.target.closest(".toolbar")) return;
        closeAllDropdowns();
    });
}

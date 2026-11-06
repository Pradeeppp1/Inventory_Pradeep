(function () {
  function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function isSameOrigin(url) {
    try {
      return new URL(url, window.location.origin).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function initThemeToggle() {
    const toggleBtn = document.getElementById("themeToggleBtn");
    if (!toggleBtn || toggleBtn.dataset.bound === "1") return;
    toggleBtn.dataset.bound = "1";

    const updateIcon = () => {
      const isDark = (document.documentElement.getAttribute("data-theme") || "light") === "dark";
      toggleBtn.innerHTML = isDark
        ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
      toggleBtn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      toggleBtn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
    };

    updateIcon();
    toggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      updateIcon();
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const options = init || {};
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || (input && input.headers) || {});
    const sameOrigin = isSameOrigin(url);

    if (sameOrigin && method !== "GET" && method !== "HEAD" && !headers.has("X-CSRFToken")) {
      const csrf = getCookie("csrftoken");
      if (csrf) headers.set("X-CSRFToken", csrf);
    }

    const fetchOpts = { ...options, headers };
    if (sameOrigin) {
      fetchOpts.credentials = "same-origin";
    }

    const response = await originalFetch(input, fetchOpts);
    if (sameOrigin && response.status === 401 && String(url).includes("/api/")) {
      window.location.href = "/login/";
    }
    return response;
  };

  document.addEventListener("DOMContentLoaded", initThemeToggle);
  initThemeToggle();

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modal.is-open").forEach((modal) => {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    });
  });
})();

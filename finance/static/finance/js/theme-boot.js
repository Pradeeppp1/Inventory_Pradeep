(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("theme") || "light";
  } catch (e) {
    theme = "light";
  }
  if (theme !== "dark" && theme !== "light") {
    theme = "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();

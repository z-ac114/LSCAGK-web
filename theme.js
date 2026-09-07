const themeKey = "agk-theme";
const savedTheme = localStorage.getItem(themeKey);

if (savedTheme === "dark") {
  document.documentElement.classList.add("dark-mode");
}

function addThemeButton() {
  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.className = "theme-toggle";
  themeButton.setAttribute("aria-label", "Toggle dark mode");
  themeButton.setAttribute("title", "Toggle dark mode");
  themeButton.innerHTML = '<svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"></path></svg><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';

  themeButton.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem(themeKey, isDark ? "dark" : "light");
  });

  document.body.append(themeButton);
}

if (document.body) {
  addThemeButton();
} else {
  document.addEventListener("DOMContentLoaded", addThemeButton);
}

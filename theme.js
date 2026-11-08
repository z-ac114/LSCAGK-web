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

function protectPastPapers() {
  const pastPapersLink = document.getElementById("past-papers-link");

  if (!pastPapersLink) {
    return;
  }

  pastPapersLink.addEventListener("click", (event) => {
    const password = window.prompt("請輸入密碼以開啟歷屆試題：");

    if (password !== "agk2627") {
      event.preventDefault();
      window.alert("密碼不正確。");
    }
  });
}


function setupNavToggle() {
  var toggle = document.querySelector(".nav-toggle");
  var header = document.querySelector(".site-header");
  if (!toggle || !header) return;
  toggle.addEventListener("click", function () {
    var open = header.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("menu-open")) {
      header.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", function (e) {
    if (header.classList.contains("menu-open") && !e.target.closest(".site-header")) {
      header.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

if (document.body) {
  addThemeButton();
  setupNavToggle();
  protectPastPapers();
} else {
  document.addEventListener("DOMContentLoaded", () => {
    addThemeButton();
    setupNavToggle();
    protectPastPapers();
  });
}

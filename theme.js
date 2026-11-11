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




function setupPageTransitions() {
  // 原生 View Transitions（Chrome／Edge）已由 CSS @view-transition 處理
  if (document.startViewTransition) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("page-fade");
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    document.documentElement.classList.add("page-fade-out");
    setTimeout(function () { location.href = a.href; }, 120);
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) document.documentElement.classList.remove("page-fade-out");
  });
}

function setupPrefetch() {
  // Chrome／Edge 已用 Speculation Rules 預載；這裡處理其他瀏覽器＋閒置全站預載
  if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) return;
  var seen = {};
  function prefetchUrl(path) {
    if (seen[path]) return;
    seen[path] = true;
    // fetch 入 HTTP cache（Safari 不支援 rel=prefetch；fetch 全適用，低優先度）
    fetch(path, { priority: "low" }).catch(function () {});
  }
  var SITE_PAGES = ["/", "/training", "/competition/", "/leaderboard/"];
  // 進入任何頁面即預載其餘內頁 —— 主頁尤其即時，令導航無縫
  var prefetchRest = function () {
    SITE_PAGES.forEach(function (p) {
      if (p !== location.pathname) prefetchUrl(p);
    });
  };
  if (document.readyState !== "loading") prefetchRest();
  else document.addEventListener("DOMContentLoaded", prefetchRest);
  document.addEventListener("mouseover", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.target === "_blank") return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    prefetchUrl(url.pathname + url.search);
  }, { passive: true });
}

function setupReveal() {
  var reveals = document.querySelectorAll(".reveal");
  if (!reveals.length) return;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    for (var i = 0; i < reveals.length; i++) reveals[i].classList.add("visible");
    return;
  }
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -32px 0px" }
  );
  for (var j = 0; j < reveals.length; j++) observer.observe(reveals[j]);
}

function setupNavToggle() {
  var toggle = document.querySelector(".nav-toggle");
  var header = document.querySelector(".site-header");
  if (!toggle || !header) return;
  // 手機版：右側滑出側欄 + 背景遮罩
  var backdrop = document.createElement("div");
  backdrop.className = "nav-backdrop";
  document.body.appendChild(backdrop);
  function setOpen(open) {
    header.classList.toggle("menu-open", open);
    backdrop.classList.toggle("show", open);
    document.body.classList.toggle("nav-lock", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
  }
  toggle.addEventListener("click", function () {
    setOpen(!header.classList.contains("menu-open"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("menu-open")) setOpen(false);
  });
  document.addEventListener("click", function (e) {
    if (!header.classList.contains("menu-open")) return;
    if (e.target.closest(".site-header")) {
      // 點選側欄連結後順手收起（頁面即將跳轉亦無妨）
      if (e.target.closest(".site-nav a")) setOpen(false);
      return;
    }
    setOpen(false);
  });
}

if (document.body) {
  addThemeButton();
  setupNavToggle();
  setupReveal();
  setupPageTransitions();
  setupPrefetch();
  protectPastPapers();
} else {
  document.addEventListener("DOMContentLoaded", () => {
    addThemeButton();
    setupNavToggle();
    setupReveal();
    setupPageTransitions();
    setupPrefetch();
    protectPastPapers();
  });
}

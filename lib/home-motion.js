/* =====================================================================
   LSCAGKT 首頁動態層（GSAP + ScrollTrigger · 漸進增強）
   · GSAP 未載入（CDN 失敗）或使用者偏好減少動態 → 直接離開，
     交回 theme.js 的 CSS reveal 系統處理，內容永不會被藏起。
   · 只動 transform / opacity；捲軸動畫一律 ease: "none" + scrub。
   ===================================================================== */
(function () {
  "use strict";

  if (!window.gsap || !window.ScrollTrigger) return;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  /* 已接管的元素（供錯誤後備時強制顯示） */
  var taken = [];

  try {
    gsap.registerPlugin(ScrollTrigger);

    var heroEls = gsap.utils.toArray(".ls-hero .reveal");
    var belowEls = gsap.utils.toArray(".reveal").filter(function (el) {
      return heroEls.indexOf(el) === -1;
    });
    taken = heroEls.concat(belowEls);

    /* 接管 CSS reveal：移除類名，改由 GSAP 全權控制（避免雙重動畫）。
       此腳本以 defer 執行，早於 theme.js 的 IntersectionObserver 綁定。 */
    taken.forEach(function (el) {
      el.classList.remove("reveal");
    });

    /* ---------- 開場：kicker → 標題 → 副題 → 入口卡（交錯浮現） ---------- */
    if (heroEls.length) {
      gsap.set(heroEls, { opacity: 0, y: 26 });
      gsap.to(heroEls, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        delay: 0.05,
      });
    }

    /* ---------- 捲軸視差：光暈反向漂移、內容微沉淡出 ---------- */
    var hero = document.querySelector(".ls-hero");
    if (hero) {
      var parallax = function (target, yPercent) {
        gsap.to(target, {
          yPercent: yPercent,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      };
      var glowA = hero.querySelector(".ls-glow-a");
      var glowB = hero.querySelector(".ls-glow-b");
      var heroContent = hero.querySelector(":scope > div:not(.ls-glow)");
      if (glowA) parallax(glowA, 24);
      if (glowB) parallax(glowB, -16);
      if (heroContent) {
        gsap.to(heroContent, {
          y: 64,
          opacity: 0.45,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      }
    }

    /* ---------- 下方區塊：進入視窗時一次性浮現 ---------- */
    belowEls.forEach(function (el) {
      gsap.from(el, {
        opacity: 0,
        y: 36,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    /* 往返頁面（bfcache / View Transitions）時重新校正捲軸位置 */
    window.addEventListener("pageshow", function (e) {
      if (e.persisted && window.ScrollTrigger) ScrollTrigger.refresh();
    });
  } catch (err) {
    /* 後備：任何錯誤都立即顯示內容，不留白屏 */
    if (window.ScrollTrigger) {
      ScrollTrigger.getAll().forEach(function (t) {
        t.kill();
      });
    }
    taken.forEach(function (el) {
      el.classList.add("visible");
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("visible");
    });
  }
})();

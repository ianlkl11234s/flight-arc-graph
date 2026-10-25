/*
 * /notes 頁面行為（在 <head> 同步執行，避免先閃深色再變淺色）。CSP 不開 inline script，所以放成外部檔。
 * - 主題：網址 ?theme=dark|light → 使用者按過的切換鈕 → 系統設定。
 * - 左側目錄標出目前讀到的段落；窄螢幕目錄預設收起；「複製連結」按鈕。
 * 移植自 Mini Taiwan Pulse 的 blog.js（拿掉地圖連結補 style= 的部分）。
 */
(function () {
  var KEY = "flight-arc:notes-theme:v1";
  var root = document.documentElement;

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "dark" || v === "light" ? v : null;
    } catch (e) {
      return null;
    }
  }
  function store(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {
      /* 私密模式等情況寫不進去：只影響下次預設 */
    }
  }
  function fromUrl() {
    var m = /[?&]theme=(dark|light)\b/.exec(location.search);
    return m ? m[1] : null;
  }
  function fromSystem() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  var urlTheme = fromUrl();
  if (urlTheme) store(urlTheme);
  var theme = urlTheme || stored() || fromSystem();

  function apply(next) {
    theme = next;
    root.classList.remove("notes-theme--dark", "notes-theme--light");
    root.classList.add("notes-theme--" + next);
    var btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      btn.textContent = next === "dark" ? "淺色" : "深色";
      btn.setAttribute("aria-label", next === "dark" ? "切換成淺色" : "切換成深色");
    }
  }

  // 目錄高亮：捲動時標出「最後一個已捲過頂部的段落」
  function watchToc() {
    var tocLinks = document.querySelectorAll("[data-toc] a");
    if (!tocLinks.length) return;
    var items = [];
    for (var i = 0; i < tocLinks.length; i++) {
      var heading = document.getElementById(tocLinks[i].getAttribute("href").slice(1));
      if (heading) items.push({ link: tocLinks[i], heading: heading });
    }
    var current = null;
    var queued = false;
    function update() {
      queued = false;
      var active = null;
      for (var k = 0; k < items.length; k++) {
        if (items[k].heading.getBoundingClientRect().top <= 120) active = items[k].link;
        else break;
      }
      if (active === current) return;
      if (current) current.removeAttribute("aria-current");
      if (active) active.setAttribute("aria-current", "true");
      current = active;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!queued) {
          queued = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  }

  function wireCopy() {
    var buttons = document.querySelectorAll("[data-copy-link]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (event) {
        var button = event.currentTarget;
        var text = button.getAttribute("data-copy-link");
        var done = function (label) {
          button.textContent = label;
          setTimeout(function () {
            button.textContent = "複製連結";
          }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              done("已複製");
            },
            function () {
              window.prompt("複製這個連結：", text);
            },
          );
        } else {
          window.prompt("複製這個連結：", text);
        }
      });
    }
  }

  apply(theme);
  document.addEventListener("DOMContentLoaded", function () {
    apply(theme);
    var btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      btn.addEventListener("click", function () {
        var next = theme === "dark" ? "light" : "dark";
        store(next);
        apply(next);
      });
    }
    // 窄螢幕的目錄預設收起（桌機側欄維持展開）
    var toc = document.querySelector(".notes-side__toc");
    if (toc && window.matchMedia("(max-width: 960px)").matches) toc.removeAttribute("open");
    watchToc();
    wireCopy();
  });
})();

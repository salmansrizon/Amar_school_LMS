// Shared behavior for every mockup page: language switch (bn default / en secondary)
// and theme switch (light / dark / system). Persists via localStorage so clicking
// between pages keeps the chosen language/theme, matching how a real app would behave.

(function () {
  var root = document.documentElement;

  function applyLang(lang) {
    root.setAttribute('data-lang', lang);
    document.querySelectorAll('[data-lang-btn]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang-btn') === lang);
    });
    localStorage.setItem('asm-lang', lang);
  }

  function applyTheme(theme) {
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    document.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-btn') === theme);
    });
    localStorage.setItem('asm-theme', theme);
  }

  window.setLang = applyLang;
  window.setTheme = applyTheme;

  document.addEventListener('DOMContentLoaded', function () {
    applyLang(localStorage.getItem('asm-lang') || 'bn');
    applyTheme(localStorage.getItem('asm-theme') || 'system');
  });
})();

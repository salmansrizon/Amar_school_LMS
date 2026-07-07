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

// Mobile navbar + off-canvas drawer + breadcrumbs (<=1024px, styles in design-system.css).
// Injected here so all app-shell pages get them without per-page markup.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var shell = document.querySelector('.app-shell');
    var sidebar = shell && shell.querySelector('.sidebar');
    var main = shell && shell.querySelector('.main');
    if (!sidebar || !main) return;

    var navbar = document.createElement('div');
    navbar.className = 'mobile-navbar';
    var toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Menu');
    toggle.innerHTML = '&#9776;';
    navbar.appendChild(toggle);
    var brand = sidebar.querySelector('.brand');
    if (brand) navbar.appendChild(brand.cloneNode(true));

    var backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    toggle.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    backdrop.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    document.body.appendChild(backdrop);

    // Breadcrumbs: Home > active nav section > page title (bilingual spans cloned as-is)
    var crumbs = document.createElement('nav');
    crumbs.className = 'crumbs';
    crumbs.innerHTML = '<a href="../sitemap.html"><span data-i18n="bn">হোম</span><span data-i18n="en">Home</span></a>';
    var active = sidebar.querySelector('a.nav-item.active');
    if (active) {
      crumbs.insertAdjacentHTML('beforeend', '<span class="sep">›</span>');
      var section = document.createElement('a');
      section.href = active.getAttribute('href');
      section.innerHTML = active.innerHTML;
      crumbs.appendChild(section);
    }
    var title = main.querySelector('.topbar .title');
    if (title && (!active || title.textContent.trim() !== active.textContent.trim())) {
      crumbs.insertAdjacentHTML('beforeend', '<span class="sep">›</span>');
      var current = document.createElement('span');
      current.className = 'current';
      current.innerHTML = title.innerHTML;
      crumbs.appendChild(current);
    }

    main.prepend(crumbs);
    main.prepend(navbar);
  });
})();

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

// Vector nav icons (Lucide-style inline SVG, currentColor) injected into the sidebar nav.
// Keyed by the nav item's href filename so every role's shell gets icons with no per-page markup.
// Icons inherit the token-driven nav text color (incl. the active/violet state) via currentColor.
(function () {
  var ICONS = {
    'dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'students-list': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>',
    'employees-list': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'attendance-student-mark': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="m9 10 2 2 4-4"/><path d="M8 2v4M16 2v4"/>',
    'classes-list': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5a4 4 0 0 1-4 4 4 4 0 0 1-4-4z"/>',
    'exams-list': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    'fee-collection': '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    'sms-compose': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'notices-list': '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    'feedback-inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'staff-permissions': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'institute-profile': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    'schools-list': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    'dealers-list': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'gov-officials-list': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'codes-list': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    'locations-tree': '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>',
    'clusters': '<path d="M4 20h16M6 20V8M12 20V4M18 20v-8"/>',
    'vendor-accounting-ledger': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    'vendor-sms-compose': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'central-holiday-calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    'code-purchase': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    'school-drilldown': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    'performance-reports': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgFor(inner) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = inner;
    return svg;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    nav.querySelectorAll('a.nav-item').forEach(function (link) {
      if (link.querySelector('.nav-icon')) return;
      var href = link.getAttribute('href') || '';
      var file = href.split('/').pop().split('#')[0].replace(/\.html$/, '');
      var inner = ICONS[file];
      if (!inner) return;
      var span = document.createElement('span');
      span.className = 'nav-icon';
      span.appendChild(svgFor(inner));
      link.insertBefore(span, link.firstChild);
    });
  });
})();

// Wrap each data-table in a horizontal-scroll container so it aligns to the card width on all
// displays and scrolls only when its content is wider than the container (replaces the old
// display:block mobile hack). Guard against double-wrapping if this ever runs twice.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('table.data-table').forEach(function (t) {
      if (t.parentElement && t.parentElement.classList.contains('table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  });
})();

// Sidebar user-profile block, pinned to the bottom of the sidebar. Role/label is derived from
// the current page's folder so it matches the active role (School Owner, Staff User, Dealer,
// Government Official, Super Admin). Bilingual markup per DESIGN-SPEC rule 4.
(function () {
  var ROLES = [
    { key: 'super-admin', bn: 'সুপার অ্যাডমিন', en: 'Super Admin', init: 'A' },
    { key: 'gov-official', bn: 'সরকারি কর্মকর্তা', en: 'Government Official', init: 'G' },
    { key: 'staff-user', bn: 'স্টাফ ইউজার', en: 'Staff User', init: 'SU' },
    { key: 'dealer', bn: 'ডিলার', en: 'Dealer', init: 'D' },
    { key: 'school-owner', bn: 'স্কুল মালিক', en: 'School Owner', init: 'SO' }
  ];
  var GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';

  document.addEventListener('DOMContentLoaded', function () {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.querySelector('.sidebar-profile')) return;
    var path = window.location.pathname;
    var role = ROLES.find(function (r) { return path.indexOf('/' + r.key + '/') !== -1; }) || ROLES[ROLES.length - 1];

    var profile = document.createElement('div');
    profile.className = 'sidebar-profile';
    profile.innerHTML =
      '<div class="avatar">' + role.init + '</div>' +
      '<div class="meta">' +
        '<div class="name"><span data-i18n="bn">' + role.bn + '</span><span data-i18n="en">' + role.en + '</span></div>' +
        '<div class="status"><span class="dot"></span><span data-i18n="bn">সক্রিয়</span><span data-i18n="en">Active</span></div>' +
      '</div>' +
      '<button class="profile-action" type="button" aria-label="Settings" title="Settings">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + GEAR + '</svg>' +
      '</button>';
    sidebar.appendChild(profile);
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
      // Clone and strip the injected nav icon so it doesn't leak into the breadcrumb (top nav)
      var navClone = active.cloneNode(true);
      var navIcon = navClone.querySelector('.nav-icon');
      if (navIcon) navIcon.parentNode.removeChild(navIcon);
      section.innerHTML = navClone.innerHTML;
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

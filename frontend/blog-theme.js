(() => {
  const themes = new Set(['sketch', 'kenji']);
  const labels = {
    sketch: 'Sketch',
    kenji: 'Kenji',
  };
  const colors = {
    sketch: '#fdfbf7',
    kenji: '#000000',
  };
  const storageKey = 'michel-site-theme';
  const oldStorageKey = 'michel-blog-theme';
  const kenjiExactHref = './kenji-exact-home.html';
  function isIndexPage() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    return path === 'index.html' || path === '';
  }

  function routeToKenjiExact(replace = false) {
    if (!isIndexPage()) return false;
    const target = `${kenjiExactHref}${window.location.hash || ''}`;
    if (replace) window.location.replace(target);
    else window.location.href = target;
    return true;
  }

  function readTheme() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('theme');
    if (fromUrl === 'gallery' || fromUrl === 'kenji') {
      if (routeToKenjiExact(true)) return 'sketch';
      return fromUrl === 'gallery' ? 'kenji' : fromUrl;
    }
    if (themes.has(fromUrl)) {
      try {
        window.localStorage.setItem(storageKey, fromUrl);
        window.localStorage.setItem(oldStorageKey, fromUrl);
      } catch (_) {}
      return fromUrl;
    }
    try {
      const saved = window.localStorage.getItem(storageKey) || window.localStorage.getItem(oldStorageKey);
      if (saved === 'kenji' && isIndexPage()) {
        window.localStorage.setItem(storageKey, 'sketch');
        window.localStorage.setItem(oldStorageKey, 'sketch');
        return 'sketch';
      }
      if (themes.has(saved)) return saved;
      if (saved) {
        window.localStorage.setItem(storageKey, 'sketch');
        window.localStorage.setItem(oldStorageKey, 'sketch');
        return 'sketch';
      }
    } catch (_) {}
    return 'sketch';
  }

  function applyTheme(theme, persist = true) {
    const next = themes.has(theme) ? theme : 'sketch';
    const renderedTheme = next === 'kenji' ? 'gallery' : next;
    document.documentElement.dataset.siteTheme = renderedTheme;
    document.documentElement.dataset.activeTheme = next;
    // Keep the old attribute as a compatibility bridge for existing article styles.
    document.documentElement.dataset.blogTheme = renderedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[next] || colors.sketch);
    if (persist) {
      try {
        window.localStorage.setItem(storageKey, next);
        window.localStorage.setItem(oldStorageKey, next);
      } catch (_) {}
    }
    return next;
  }

  function themedHref(href, theme = readTheme()) {
    try {
      const raw = String(href || '');
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) return href;
      if (/\/post\.html$/.test(url.pathname)) {
        url.searchParams.set('theme', theme);
        return `${url.pathname}${url.search}${url.hash}`;
      }
      return raw;
    } catch (_) {
      return href;
    }
  }

  function syncControls(theme) {
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      const active = button.dataset.themeChoice === theme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-theme-current]').forEach((node) => {
      node.textContent = labels[theme] || labels.sketch;
    });
  }

  function syncLinks(theme) {
    document.querySelectorAll('a[href*="post.html"]').forEach((link) => {
      link.href = themedHref(link.getAttribute('href') || link.href, theme);
    });
    document.querySelectorAll('.post-top-row .back-link[href], .post-nav a[href*="home=1"]').forEach((link) => {
      try {
        const url = new URL(link.getAttribute('href') || link.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        url.searchParams.set('theme', theme);
        link.href = `${url.pathname}${url.search}${url.hash}`;
      } catch (_) {}
    });
  }

  const initial = applyTheme(readTheme(), true);
  const api = {
    themes: Array.from(themes),
    labels,
    get: () => document.documentElement.dataset.activeTheme || initial,
    set: (theme) => {
      const next = applyTheme(theme, true);
      syncControls(next);
      syncLinks(next);
      return next;
    },
    href: themedHref,
  };

  window.MICHEL_SITE_THEME = api;
  window.MICHEL_BLOG_THEME = api;

  document.addEventListener('DOMContentLoaded', () => {
    const current = document.documentElement.dataset.activeTheme || initial;
    syncControls(current);
    syncLinks(current);
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const choice = button.dataset.themeChoice;
        if (choice === 'kenji' && routeToKenjiExact(false)) {
          button.blur();
          return;
        }
        const next = api.set(choice);
        button.blur();
        window.dispatchEvent(new CustomEvent('michel:site-theme-change', { detail: { theme: next } }));
        window.dispatchEvent(new CustomEvent('michel:blog-theme-change', { detail: { theme: next } }));
      });
    });
  });
})();

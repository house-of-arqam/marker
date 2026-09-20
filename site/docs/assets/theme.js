// Light/dark theme. Colors come from light-dark() in CSS, so the OS preference
// already works with no JS; this only records an explicit override on <html>
// (data-theme), which every page reads back on load.
(function () {
  const root = document.documentElement;
  const STORAGE_KEY = 'marker-theme';

  let stored = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch (_err) {
    // Storage can be blocked; the OS preference still applies.
  }
  if (stored === 'light' || stored === 'dark') root.dataset.theme = stored;

  // This file runs in <head> so the stored theme applies before first paint,
  // which means the toggle itself is not in the DOM yet.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggle);
  } else {
    wireToggle();
  }

  function isDark() {
    if (root.dataset.theme) return root.dataset.theme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function paintToggle(toggle) {
    const dark = isDark();
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function wireToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch (_err) {
        // Nothing to do — the toggle still applies for this page view.
      }
      paintToggle(toggle);
    });

    paintToggle(toggle);
  }
})();

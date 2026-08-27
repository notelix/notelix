(() => {
  const root = document.documentElement;
  const storedTheme = localStorage.getItem('notelix-site-theme');
  const initialTheme = ['light', 'dark'].includes(storedTheme)
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

  function setTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem('notelix-site-theme', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute(
        'aria-label',
        `Use ${theme === 'dark' ? 'light' : 'dark'} theme`,
      );
    });
  }

  setTheme(initialTheme);
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () =>
      setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'),
    );
  });

  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-site-nav]');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = navToggle.getAttribute('aria-expanded') !== 'true';
      navToggle.setAttribute('aria-expanded', String(open));
      nav.dataset.open = String(open);
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        navToggle.setAttribute('aria-expanded', 'false');
        nav.dataset.open = 'false';
      }
    });
  }

  document.querySelectorAll('[data-current-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();

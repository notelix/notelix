(() => {
  const storageKey = 'notelix-embedded-demo-token';
  let staticToken = localStorage.getItem(storageKey);
  if (!staticToken || !/^[a-f0-9]{64}$/.test(staticToken)) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    staticToken = Array.from(bytes, (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    localStorage.setItem(storageKey, staticToken);
  }

  const httpOrigin = ['http:', 'https:'].includes(window.location.protocol)
    ? window.location.origin
    : 'https://public-dev.notelix.com';
  window.NotelixEmbeddedConfig = {
    server: httpOrigin,
    staticToken,
    rootElementClassName: 'notelix-enabled',
    demoLocalOnly: true,
  };

  const script = document.createElement('script');
  script.src = `${httpOrigin}/embedded/content-script.dist.js`;
  script.addEventListener('error', () => {
    document.body.dataset.demoUnavailable = 'true';
  });
  document.head.appendChild(script);
})();

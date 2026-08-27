(() => {
  const httpOrigin = ['http:', 'https:'].includes(window.location.protocol)
    ? window.location.origin
    : 'https://public-dev.notelix.com';
  const privacyTitle = document.querySelector('.demo-privacy strong');
  const privacyDescription = document.querySelector('.demo-privacy p');
  let config = window.NotelixEmbeddedConfig;
  const configuredToken = config?.staticToken;
  const configIsValid = /^[a-f0-9]{64}$/.test(configuredToken || '');

  if (!configIsValid) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const staticToken = Array.from(bytes, (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    config = {
      server: httpOrigin,
      staticToken,
      rootElementClassName: 'notelix-enabled',
      demoLocalOnly: true,
      language: 'en',
      theme: 'light',
    };
    window.NotelixEmbeddedConfig = config;
  }

  if (!config.demoLocalOnly) {
    document.body.dataset.demoPersistence = 'shared';
  } else {
    document.body.dataset.demoPersistence = 'local';
    if (privacyTitle) privacyTitle.textContent = 'Private local playground';
    if (privacyDescription) {
      privacyDescription.textContent =
        'Persistent demo storage is unavailable. Highlights and notes reset when this page reloads.';
    }
  }

  const script = document.createElement('script');
  script.src = `${config.server}/embedded/content-script.dist.js`;
  script.addEventListener('error', () => {
    document.body.dataset.demoUnavailable = 'true';
  });
  document.head.appendChild(script);
})();

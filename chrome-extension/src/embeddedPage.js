export function shouldDeferToEmbeddedPage({
  embeddedConfig,
  pathname,
  scriptSources,
}) {
  if (embeddedConfig) return false;
  if (!/^\/embedded\/?$/.test(pathname)) return false;
  return scriptSources.some((source) =>
    /\/assets\/embedded\.js(?:[?#]|$)/.test(source),
  );
}

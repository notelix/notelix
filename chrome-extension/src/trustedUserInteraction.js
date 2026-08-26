export function isTrustedUserInteraction(event) {
  return Boolean(window.NotelixEmbeddedConfig || event?.isTrusted);
}

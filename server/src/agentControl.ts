const browserExtensionSchemes = ['chrome-extension://', 'moz-extension://'];

function configuredAgentControlOrigins(): string[] {
  return (process.env.AGENT_CONTROL_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAgentControlOriginAllowed(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  const configuredOrigins = configuredAgentControlOrigins();
  if (configuredOrigins.length > 0) {
    return configuredOrigins.includes(origin);
  }

  return browserExtensionSchemes.some((scheme) => origin.startsWith(scheme));
}

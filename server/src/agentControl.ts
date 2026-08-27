const browserExtensionOriginPattern =
  /^(?:chrome|moz)-extension:\/\/[a-z0-9_-]+$/;

function configuredAgentControlOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return (environment.AGENT_CONTROL_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isRunModeAgent(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.RUN_MODE === 'AGENT';
}

export function validateAgentControlOrigins(
  runMode: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (runMode !== 'AGENT') {
    return;
  }

  const configuredOrigins = configuredAgentControlOrigins(environment);
  if (
    configuredOrigins.length === 0 ||
    configuredOrigins.some(
      (origin) => !browserExtensionOriginPattern.test(origin),
    )
  ) {
    throw new Error(
      'AGENT_CONTROL_ORIGINS must contain one or more comma-separated chrome-extension:// or moz-extension:// origins when RUN_MODE=AGENT',
    );
  }
}

export function isAgentControlOriginAllowed(origin?: string): boolean {
  if (!origin) {
    // Origin-less requests are made by local CLI tools rather than a browser,
    // and the agent listener is bound to loopback by the supported deployment.
    return true;
  }

  const configuredOrigins = configuredAgentControlOrigins();
  return configuredOrigins.includes(origin);
}

import {
  readBooleanEnvironment,
  readBoundedIntegerEnvironment,
} from '../../runtime-config';

export interface StaticTokenProvisioningConfig {
  enabled: boolean;
  accountLimit: number;
  verifier: StaticTokenVerifierConfig | null;
}

export interface StaticTokenVerifierConfig {
  url: string;
  secret: string;
  timeoutMs: number;
}

function readVerifierConfig(
  environment: NodeJS.ProcessEnv,
): StaticTokenVerifierConfig | null {
  const url = environment.STATIC_TOKEN_VERIFIER_URL?.trim() || '';
  const secret = environment.STATIC_TOKEN_VERIFIER_SECRET?.trim() || '';

  if (!url && !secret) {
    return null;
  }
  if (!url || !secret) {
    throw new Error(
      'STATIC_TOKEN_VERIFIER_URL and STATIC_TOKEN_VERIFIER_SECRET must be configured together',
    );
  }
  if (secret.length < 32) {
    throw new Error(
      'STATIC_TOKEN_VERIFIER_SECRET must contain at least 32 characters',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    throw new Error('STATIC_TOKEN_VERIFIER_URL must be a valid URL');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('STATIC_TOKEN_VERIFIER_URL must use http or https');
  }

  return {
    url: parsedUrl.toString(),
    secret,
    timeoutMs: readBoundedIntegerEnvironment(
      'STATIC_TOKEN_VERIFIER_TIMEOUT_MS',
      2000,
      100,
      30000,
      environment,
    ),
  };
}

export function readStaticTokenProvisioningConfig(
  environment: NodeJS.ProcessEnv = process.env,
): StaticTokenProvisioningConfig {
  const enabled = readBooleanEnvironment(
    'STATIC_TOKEN_AUTO_PROVISION',
    false,
    environment,
  );
  const verifier = readVerifierConfig(environment);

  if (enabled && environment.NODE_ENV === 'production' && !verifier) {
    throw new Error(
      'production static-token provisioning requires STATIC_TOKEN_VERIFIER_URL and STATIC_TOKEN_VERIFIER_SECRET',
    );
  }

  return {
    enabled,
    accountLimit: readBoundedIntegerEnvironment(
      'STATIC_TOKEN_AUTO_PROVISION_LIMIT',
      1000,
      1,
      1000000,
      environment,
    ),
    verifier,
  };
}

import { StaticTokenVerifierConfig } from './staticTokenProvisioning';

interface StaticTokenVerifierResponse {
  valid: boolean;
}

function isVerifierResponse(
  value: unknown,
): value is StaticTokenVerifierResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { valid?: unknown }).valid === 'boolean'
  );
}

export async function verifyStaticTokenDigest(
  tokenDigest: string,
  config: StaticTokenVerifierConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImplementation(config.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token_digest_sha256: tokenDigest }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`static-token verifier returned HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!isVerifierResponse(body)) {
      throw new Error('static-token verifier returned an invalid response');
    }
    return body.valid;
  } finally {
    clearTimeout(timeout);
  }
}

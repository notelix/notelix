import { verifyStaticTokenDigest } from '../src/security/staticTokenVerifier';

describe('Static-token external verifier', () => {
  const config = {
    url: 'http://icdesign-backend/api/integrations/notelix/static-token/verify',
    secret: 'integration-secret-with-at-least-32-characters',
    timeoutMs: 2000,
  };

  it('sends only the digest and returns the verifier decision', async () => {
    const digest = 'a'.repeat(64);
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ valid: true }),
    });

    await expect(
      verifyStaticTokenDigest(
        digest,
        config,
        fetchImplementation as unknown as typeof fetch,
      ),
    ).resolves.toBe(true);
    expect(fetchImplementation).toHaveBeenCalledWith(config.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token_digest_sha256: digest }),
      signal: expect.any(AbortSignal),
    });
  });

  it('fails closed on HTTP errors and malformed responses', async () => {
    const httpFailure = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    await expect(
      verifyStaticTokenDigest(
        'b'.repeat(64),
        config,
        httpFailure as unknown as typeof fetch,
      ),
    ).rejects.toThrow('static-token verifier returned HTTP 503');

    const malformed = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ accepted: true }),
    });
    await expect(
      verifyStaticTokenDigest(
        'c'.repeat(64),
        config,
        malformed as unknown as typeof fetch,
      ),
    ).rejects.toThrow('static-token verifier returned an invalid response');
  });
});

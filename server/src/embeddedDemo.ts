const embeddedDemoTokenPattern = /^[a-f0-9]{64}$/;

export function readEmbeddedDemoStaticToken(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const token = environment.EMBEDDED_DEMO_STATIC_TOKEN?.trim() || '';
  if (!token) {
    return null;
  }
  if (!embeddedDemoTokenPattern.test(token)) {
    throw new Error(
      'EMBEDDED_DEMO_STATIC_TOKEN must contain exactly 64 lowercase hexadecimal characters',
    );
  }
  return token;
}

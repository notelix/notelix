const assert = require('assert');

const serverUrl = new URL(
  process.env.TEST_DEGRADED_SERVER_URL || 'http://127.0.0.1:18580',
);

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(new URL('/meta/health', serverUrl));
      if (response.status === 200) {
        assert.deepStrictEqual(await response.json(), { status: 'ok' });
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(
    `Server did not start without Meilisearch: ${String(lastError || '')}`,
  );
}

async function main() {
  await waitForHealth();
  const readiness = await fetch(new URL('/meta/ready', serverUrl));
  assert.strictEqual(readiness.status, 503);
  assert.deepStrictEqual(await readiness.json(), {
    status: 'unavailable',
    checks: { postgres: 'up', meilisearch: 'down' },
  });
  const search = await fetch(new URL('/annotations/search', serverUrl), {
    method: 'POST',
    headers: {
      Authorization: `static-token ${'d'.repeat(64)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: 'unavailable search' }),
  });
  assert.strictEqual(search.status, 503);
  assert.deepStrictEqual(await search.json(), {
    message: 'annotation search unavailable',
    error: 'Service Unavailable',
    statusCode: 503,
  });
  console.log('Degraded startup without Meilisearch test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

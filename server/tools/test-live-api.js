const assert = require('assert');
const http = require('http');

const serverUrl = new URL(
  process.env.TEST_SERVER_URL || 'http://127.0.0.1:18575',
);

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function request(path, body, headers = {}) {
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      new URL(path, serverUrl),
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...headers,
          ...(serializedBody
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(serializedBody),
              }
            : {}),
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          let parsedBody = responseBody;
          try {
            parsedBody = responseBody ? JSON.parse(responseBody) : null;
          } catch (_error) {
            // Preserve non-JSON responses for useful assertion messages.
          }
          resolve({ status: response.statusCode, body: parsedBody });
        });
      },
    );
    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await request('/meta/version');
      if (response.status === 200 && response.body.notelix === true) {
        return;
      }
    } catch (_error) {
      // The server may still be creating its RSA key or opening the database.
    }
    await sleep(250);
  }
  throw new Error(`Server did not become ready at ${serverUrl}`);
}

async function waitForSearch(headers, query, expectedHits) {
  let lastResponse;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    lastResponse = await request('/annotations/search', { q: query }, headers);
    if (
      lastResponse.status === 201 &&
      lastResponse.body.results.hits.length === expectedHits
    ) {
      return lastResponse.body.results.hits;
    }
    await sleep(250);
  }
  assert.fail(
    `Search did not reach ${expectedHits} hits: ${JSON.stringify(
      lastResponse,
    )}`,
  );
}

async function main() {
  await waitForServer();

  const username = `integration-${Date.now()}`;
  const password = 'integration-password';
  const uid = 'integration-annotation';
  const url = 'https://example.com/integration';

  assert.strictEqual(
    (await request('/users/signup', { username, password })).status,
    201,
  );

  const login = await request('/users/login', { username, password });
  assert.strictEqual(login.status, 201, JSON.stringify(login.body));
  assert.strictEqual(login.body.name, username);
  assert.strictEqual(Object.hasOwn(login.body, 'password'), false);
  assert.ok(login.body.jwt);

  const headers = { Authorization: `jwt ${login.body.jwt}` };
  const save = await request(
    '/annotations/save',
    {
      uid,
      url,
      host: 'example.com',
      title: 'Integration test',
      data: { text: 'durable searchable text', notes: 'integration note' },
    },
    headers,
  );
  assert.strictEqual(save.status, 201, JSON.stringify(save.body));

  const listDiff = await request(
    '/annotations/listDiff',
    { sinceId: 0 },
    headers,
  );
  assert.strictEqual(listDiff.status, 201, JSON.stringify(listDiff.body));
  assert.strictEqual(listDiff.body.ok, true);
  assert.strictEqual(listDiff.body.diff.length, 1);
  assert.strictEqual(listDiff.body.diff[0].kind, 1);
  const saveHistoryId = listDiff.body.diff[0].id;

  const byUrl = await request('/annotations/queryByUrl', { url }, headers);
  assert.strictEqual(byUrl.status, 201, JSON.stringify(byUrl.body));
  assert.strictEqual(byUrl.body.list.length, 1);
  assert.strictEqual(byUrl.body.list[0].uid, uid);

  const searchHits = await waitForSearch(headers, 'searchable text', 1);
  assert.strictEqual(searchHits[0].id, byUrl.body.list[0].id);

  const deletion = await request('/annotations/delete', { uid }, headers);
  assert.strictEqual(deletion.status, 201, JSON.stringify(deletion.body));

  const deleteDiff = await request(
    '/annotations/listDiff',
    { sinceId: saveHistoryId },
    headers,
  );
  assert.strictEqual(deleteDiff.status, 201, JSON.stringify(deleteDiff.body));
  assert.strictEqual(deleteDiff.body.ok, true);
  assert.strictEqual(deleteDiff.body.diff.length, 1);
  assert.strictEqual(deleteDiff.body.diff[0].kind, 2);
  await waitForSearch(headers, 'searchable text', 0);

  console.log('Live API integration test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

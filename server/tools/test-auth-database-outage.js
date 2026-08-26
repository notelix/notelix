const assert = require('assert');
const fs = require('fs');

const serverUrl = new URL(
  process.env.TEST_SERVER_URL || 'http://127.0.0.1:18575',
);
const provisioningServerUrl = new URL(
  process.env.TEST_SECONDARY_SERVER_URL || serverUrl,
);
const statePath = process.env.TEST_AUTH_STATE_PATH;
const phase = process.argv[2];

assert.ok(statePath, 'TEST_AUTH_STATE_PATH is required');
assert.ok(
  ['prepare', 'outage', 'recovered'].includes(phase),
  'expected prepare, outage, or recovered phase',
);

async function requestAt(baseUrl, path, body, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function request(path, body, headers = {}) {
  return requestAt(serverUrl, path, body, headers);
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await requestAt(baseUrl, '/meta/ready');
      if (response.status === 200 && response.body.status === 'ok') {
        return;
      }
    } catch (_error) {
      // The server may still be opening its listener or database pool.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
}

function loadState() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

async function prepare() {
  const username = `auth-outage-${Date.now()}`;
  const password = 'auth-outage-password';
  const signup = await requestAt(provisioningServerUrl, '/users/signup', {
    username,
    password,
  });
  assert.strictEqual(signup.status, 201, JSON.stringify(signup.body));
  const login = await requestAt(provisioningServerUrl, '/users/login', {
    username,
    password,
  });
  assert.strictEqual(login.status, 201, JSON.stringify(login.body));
  assert.ok(login.body.jwt);
  const primaryAuthentication = await request('/users/who-am-i', undefined, {
    Authorization: `jwt ${login.body.jwt}`,
  });
  assert.strictEqual(
    primaryAuthentication.status,
    200,
    JSON.stringify(primaryAuthentication.body),
  );
  fs.writeFileSync(
    statePath,
    JSON.stringify({ id: login.body.id, name: username, jwt: login.body.jwt }),
    { mode: 0o600 },
  );
}

async function assertOutage() {
  const state = loadState();
  const response = await request('/users/who-am-i', undefined, {
    Authorization: `jwt ${state.jwt}`,
  });
  assert.strictEqual(response.status, 503, JSON.stringify(response.body));
  assert.deepStrictEqual(response.body, {
    message: 'authentication temporarily unavailable',
    retryable: true,
  });
  assert.strictEqual(
    Object.hasOwn(response.body, 'clearClientCredentials'),
    false,
  );
}

async function assertRecovered() {
  const state = loadState();
  let lastResponse;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    lastResponse = await request('/users/who-am-i', undefined, {
      Authorization: `jwt ${state.jwt}`,
    });
    if (lastResponse.status === 200) {
      assert.strictEqual(lastResponse.body.id, state.id);
      assert.strictEqual(lastResponse.body.name, state.name);
      return;
    }
    assert.strictEqual(
      lastResponse.status,
      503,
      JSON.stringify(lastResponse.body),
    );
    assert.strictEqual(
      Object.hasOwn(lastResponse.body, 'clearClientCredentials'),
      false,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`Authentication did not recover: ${JSON.stringify(lastResponse)}`);
}

async function main() {
  if (phase === 'prepare') {
    await Promise.all([
      waitForServer(serverUrl),
      waitForServer(provisioningServerUrl),
    ]);
    await prepare();
  } else if (phase === 'outage') {
    await assertOutage();
  } else {
    await assertRecovered();
  }
  console.log(`Authentication database ${phase} test passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

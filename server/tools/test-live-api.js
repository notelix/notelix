const assert = require('assert');
const { createHash } = require('crypto');
const http = require('http');
const { Client } = require('pg');
const ormconfig = require('../ormconfig');

const serverUrl = new URL(
  process.env.TEST_SERVER_URL || 'http://127.0.0.1:18575',
);
const secondaryServerUrl = process.env.TEST_SECONDARY_SERVER_URL
  ? new URL(process.env.TEST_SECONDARY_SERVER_URL)
  : null;

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function requestAt(baseUrl, path, body, headers = {}) {
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      new URL(path, baseUrl),
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
          resolve({
            status: response.statusCode,
            body: parsedBody,
            headers: response.headers,
          });
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

function request(path, body, headers = {}) {
  return requestAt(serverUrl, path, body, headers);
}

async function waitForServer(baseUrl = serverUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await requestAt(baseUrl, '/meta/ready');
      if (response.status === 200 && response.body.status === 'ok') {
        return;
      }
    } catch (_error) {
      // The server may still be creating its RSA key or opening the database.
    }
    await sleep(250);
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
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
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();
  let outbox;
  try {
    outbox = await client.query(`
      SELECT "annotation_id", "revision", "attempt_count", "available_at",
             "claim_token"
      FROM "annotation_search_outbox"
      ORDER BY "annotation_id"
    `);
  } finally {
    await client.end();
  }
  assert.fail(
    `Search did not reach ${expectedHits} hits: ${JSON.stringify({
      lastResponse,
      outbox: outbox.rows,
    })}`,
  );
}

async function assertStaticTokenIsProtected(staticToken) {
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();
  try {
    const tokenDigest = createHash('sha256')
      .update(staticToken, 'utf8')
      .digest('hex');
    const persisted = await client.query(
      `
        SELECT token."staticToken" AS token_digest, account."name" AS user_name
        FROM "static_token" token
        JOIN "user" account ON account."id" = token."userId"
        WHERE token."staticToken" = $1
      `,
      [tokenDigest],
    );
    assert.strictEqual(persisted.rowCount, 1);
    assert.strictEqual(persisted.rows[0].token_digest, tokenDigest);
    assert.match(persisted.rows[0].user_name, /^guest_[0-9a-f]{32}$/);
    assert.strictEqual(
      persisted.rows[0].user_name.includes(staticToken),
      false,
    );

    const plaintext = await client.query(
      'SELECT 1 FROM "static_token" WHERE "staticToken" = $1',
      [staticToken],
    );
    assert.strictEqual(plaintext.rowCount, 0);
  } finally {
    await client.end();
  }
}

async function assertAnnotationHistoryIsProtected(username) {
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();
  try {
    const persisted = await client.query(
      `
        SELECT history."data", account."password"
        FROM "annotation_change_history" history
        JOIN "user" account ON account."id" = history."userId"
        WHERE account."name" = $1
        ORDER BY history."id"
      `,
      [username],
    );
    assert.ok(persisted.rowCount >= 3);
    for (const row of persisted.rows) {
      assert.strictEqual(Object.hasOwn(row.data, 'user'), false);
      assert.strictEqual(
        JSON.stringify(row.data).includes(row.password),
        false,
      );
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await Promise.all(
    [serverUrl, secondaryServerUrl].filter(Boolean).map(waitForServer),
  );

  const metadata = await request('/meta/version');
  assert.strictEqual(metadata.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(metadata.headers['x-frame-options'], 'SAMEORIGIN');
  assert.strictEqual(metadata.headers['access-control-allow-origin'], '*');
  assert.deepStrictEqual((await request('/meta/health')).body, {
    status: 'ok',
  });
  assert.deepStrictEqual((await request('/meta/ready')).body, {
    status: 'ok',
    checks: { postgres: 'up', meilisearch: 'up' },
  });
  const oversizedRequest = await request('/users/login', {
    username: 'oversized-request',
    password: 'x'.repeat(1100000),
  });
  assert.strictEqual(
    oversizedRequest.status,
    413,
    JSON.stringify(oversizedRequest.body),
  );
  assert.strictEqual(
    (
      await request('/agentsync/set', {
        config: {
          enabled: true,
          url: 'https://notelix.example',
          token: 'signed-jwt',
          clientSideEncryptionKey: null,
        },
      })
    ).status,
    403,
  );

  const username = `integration-${Date.now()}`;
  let password = 'integration-password';
  const uid = 'integration-annotation';
  const url = 'https://example.com/integration';

  assert.strictEqual(
    (
      await request('/users/signup', {
        username: `${username}-invalid`,
        password: 'short',
      })
    ).status,
    400,
  );

  assert.strictEqual(
    (await request('/users/signup', { username, password })).status,
    201,
  );

  const login = await request('/users/login', { username, password });
  assert.strictEqual(login.status, 201, JSON.stringify(login.body));
  assert.strictEqual(login.body.name, username);
  assert.strictEqual(Object.hasOwn(login.body, 'password'), false);
  assert.ok(login.body.jwt);
  const jwtPayload = JSON.parse(
    Buffer.from(login.body.jwt.split('.')[1], 'base64url').toString('utf8'),
  );
  assert.strictEqual(jwtPayload.iss, 'notelix');
  assert.strictEqual(jwtPayload.tokenVersion, 0);
  assert.ok(jwtPayload.exp > jwtPayload.iat);

  const duplicateSignup = await request('/users/signup', {
    username: `  ${username}  `,
    password,
  });
  assert.strictEqual(
    duplicateSignup.status,
    409,
    JSON.stringify(duplicateSignup.body),
  );

  const staticToken = 's'.repeat(64);
  const staticTokenResponses = await Promise.all(
    Array.from({ length: 5 }, () =>
      request('/users/who-am-i', undefined, {
        Authorization: `static-token ${staticToken}`,
      }),
    ),
  );
  assert.ok(staticTokenResponses.every((response) => response.status === 200));
  assert.strictEqual(
    new Set(staticTokenResponses.map((response) => response.body.id)).size,
    1,
  );
  await assertStaticTokenIsProtected(staticToken);
  const emptySnapshot = await request(
    '/annotations/listPage',
    {},
    { Authorization: `static-token ${staticToken}` },
  );
  assert.strictEqual(
    emptySnapshot.status,
    201,
    JSON.stringify(emptySnapshot.body),
  );
  assert.deepStrictEqual(emptySnapshot.body.list, []);
  assert.strictEqual(emptySnapshot.body.annotationChangeHistoryLatestId, 0);
  assert.strictEqual(emptySnapshot.body.nextAfterId, 0);
  assert.strictEqual(emptySnapshot.body.hasMore, false);
  assert.match(emptySnapshot.body.snapshotId, /^[0-9a-f-]{36}$/);

  const originalHeaders = { Authorization: `jwt ${login.body.jwt}` };
  const candidatePasswords = [
    'integration-password-updated-a',
    'integration-password-updated-b',
  ];
  const racingLoginsPromise = Promise.all(
    Array.from({ length: 2 }, () =>
      request('/users/login', { username, password }),
    ),
  );
  const passwordChanges = await Promise.all(
    candidatePasswords.map((newPassword, index) =>
      requestAt(
        index === 0 || !secondaryServerUrl ? serverUrl : secondaryServerUrl,
        '/users/change-password',
        {
          oldPassword: password,
          newPassword,
          newClientSideEncryptionParams: null,
        },
        originalHeaders,
      ),
    ),
  );
  const racingLogins = await racingLoginsPromise;
  assert.ok(
    racingLogins.every((response) => [201, 403].includes(response.status)),
    JSON.stringify(racingLogins),
  );
  assert.deepStrictEqual(
    passwordChanges.map((response) => response.status).sort(),
    [201, 403],
    JSON.stringify(passwordChanges),
  );

  const revokedSession = await request(
    '/users/who-am-i',
    undefined,
    originalHeaders,
  );
  assert.strictEqual(revokedSession.status, 401);
  assert.deepStrictEqual(revokedSession.body, {
    message: 'authentication failed',
    clearClientCredentials: true,
  });

  const candidateLogins = await Promise.all(
    candidatePasswords.map((candidatePassword) =>
      request('/users/login', { username, password: candidatePassword }),
    ),
  );
  assert.strictEqual(
    candidateLogins.filter((response) => response.status === 201).length,
    1,
    JSON.stringify(candidateLogins),
  );
  password = candidatePasswords[candidateLogins[0].status === 201 ? 0 : 1];
  const refreshedLogin = await request('/users/login', { username, password });
  assert.strictEqual(
    refreshedLogin.status,
    201,
    JSON.stringify(refreshedLogin.body),
  );
  const refreshedJwtPayload = JSON.parse(
    Buffer.from(refreshedLogin.body.jwt.split('.')[1], 'base64url').toString(
      'utf8',
    ),
  );
  assert.strictEqual(refreshedJwtPayload.tokenVersion, 1);

  const headers = { Authorization: `jwt ${refreshedLogin.body.jwt}` };
  assert.strictEqual(
    (
      await request(
        '/annotations/find',
        { selectors: { 'host; DROP TABLE annotation': 'example.com' } },
        headers,
      )
    ).status,
    400,
  );
  assert.strictEqual(
    (
      await request(
        '/annotations/save',
        { uid: 'x'.repeat(65), data: {} },
        headers,
      )
    ).status,
    400,
  );
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

  const secondUsername = `${username}-second`;
  assert.strictEqual(
    (await request('/users/signup', { username: secondUsername, password }))
      .status,
    201,
  );
  const secondLogin = await request('/users/login', {
    username: secondUsername,
    password,
  });
  assert.strictEqual(secondLogin.status, 201, JSON.stringify(secondLogin.body));
  const secondUserHeaders = {
    Authorization: `jwt ${secondLogin.body.jwt}`,
  };
  const secondUserSave = await request(
    '/annotations/save',
    {
      uid,
      url: `${url}/second-user`,
      host: 'example.com',
      title: 'Second user annotation',
      data: { text: 'same uid, separate tenant' },
    },
    secondUserHeaders,
  );
  assert.strictEqual(
    secondUserSave.status,
    201,
    JSON.stringify(secondUserSave.body),
  );

  const concurrencyUsername = `${username}-concurrency`;
  assert.strictEqual(
    (
      await request('/users/signup', {
        username: concurrencyUsername,
        password,
        enableClientSideEncryption: true,
        client_side_encryption: 'encrypted-client-key',
      })
    ).status,
    201,
  );
  const concurrencyLogin = await request('/users/login', {
    username: concurrencyUsername,
    password,
  });
  assert.strictEqual(
    concurrencyLogin.status,
    201,
    JSON.stringify(concurrencyLogin.body),
  );
  const concurrencyHeaders = {
    Authorization: `jwt ${concurrencyLogin.body.jwt}`,
  };
  const rejectedEncryptionDisable = await request(
    '/users/change-password',
    {
      oldPassword: password,
      newPassword: 'unsafe-encryption-mode-change',
      newClientSideEncryptionParams: null,
    },
    concurrencyHeaders,
  );
  assert.strictEqual(
    rejectedEncryptionDisable.status,
    400,
    JSON.stringify(rejectedEncryptionDisable.body),
  );
  assert.strictEqual(
    rejectedEncryptionDisable.body.message,
    'client-side encryption cannot be enabled or disabled during a password change',
  );
  const encryptionModeAfterRejectedChange = await request(
    '/users/who-am-i',
    undefined,
    concurrencyHeaders,
  );
  assert.strictEqual(
    encryptionModeAfterRejectedChange.status,
    200,
    JSON.stringify(encryptionModeAfterRejectedChange.body),
  );
  assert.strictEqual(
    encryptionModeAfterRejectedChange.body.client_side_encryption,
    'encrypted-client-key',
  );
  const concurrencyUid = 'concurrent-annotation';
  const concurrencyUrl = 'https://example.com/concurrent';
  const concurrentSaves = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      request(
        '/annotations/save',
        {
          uid: concurrencyUid,
          url: concurrencyUrl,
          title: `Concurrent update ${index}`,
          data: { text: `encrypted update ${index}` },
        },
        concurrencyHeaders,
      ),
    ),
  );
  assert.ok(
    concurrentSaves.every((response) => response.status === 201),
    JSON.stringify(concurrentSaves),
  );
  const concurrentAnnotations = await request(
    '/annotations/queryByUrl',
    { url: concurrencyUrl },
    concurrencyHeaders,
  );
  assert.strictEqual(
    concurrentAnnotations.status,
    201,
    JSON.stringify(concurrentAnnotations.body),
  );
  assert.strictEqual(concurrentAnnotations.body.list.length, 1);
  assert.strictEqual(concurrentAnnotations.body.list[0].uid, concurrencyUid);
  const concurrentHistoryEntries = [];
  const concurrentHistoryPageSizes = [];
  let concurrentHistoryCursor = 0;
  let concurrentHistoryHasMore = true;
  while (concurrentHistoryHasMore) {
    const concurrentHistory = await request(
      '/annotations/listDiff',
      { sinceId: concurrentHistoryCursor, limit: 2 },
      concurrencyHeaders,
    );
    assert.strictEqual(
      concurrentHistory.status,
      201,
      JSON.stringify(concurrentHistory.body),
    );
    assert.strictEqual(concurrentHistory.body.ok, true);
    assert.ok(concurrentHistory.body.diff.length > 0);
    assert.ok(concurrentHistory.body.diff.length <= 2);
    concurrentHistoryEntries.push(...concurrentHistory.body.diff);
    concurrentHistoryPageSizes.push(concurrentHistory.body.diff.length);
    concurrentHistoryCursor = concurrentHistory.body.diff.at(-1).id;
    concurrentHistoryHasMore = concurrentHistory.body.hasMore;
  }
  assert.deepStrictEqual(concurrentHistoryPageSizes, [2, 2, 1]);
  assert.strictEqual(concurrentHistoryEntries.length, 5);
  assert.ok(
    concurrentHistoryEntries.every(
      (entry) => entry.kind === 1 && !Object.hasOwn(entry.data, 'user'),
    ),
  );
  assert.strictEqual(
    (
      await request(
        '/annotations/delete',
        { uid: concurrencyUid },
        concurrencyHeaders,
      )
    ).status,
    201,
  );

  const snapshotHeaders = secondUserHeaders;
  const snapshotSecondSave = await request(
    '/annotations/save',
    {
      uid: 'snapshot-two',
      url: 'https://example.com/snapshot-two',
      title: 'Snapshot two before update',
      data: { text: 'Snapshot two before update' },
    },
    snapshotHeaders,
  );
  assert.strictEqual(
    snapshotSecondSave.status,
    201,
    JSON.stringify(snapshotSecondSave.body),
  );
  const snapshotPageOne = await request(
    '/annotations/listPage',
    { limit: 1 },
    snapshotHeaders,
  );
  assert.strictEqual(
    snapshotPageOne.status,
    201,
    JSON.stringify(snapshotPageOne.body),
  );
  assert.strictEqual(snapshotPageOne.body.list.length, 1);
  assert.strictEqual(snapshotPageOne.body.list[0].uid, uid);
  assert.strictEqual(snapshotPageOne.body.hasMore, true);
  assert.strictEqual(
    Number.isInteger(snapshotPageOne.body.annotationChangeHistoryLatestId),
    true,
    JSON.stringify(snapshotPageOne.body),
  );
  const crossUserSnapshot = await request(
    '/annotations/listPage',
    {
      snapshotId: snapshotPageOne.body.snapshotId,
      afterId: snapshotPageOne.body.nextAfterId,
      limit: 1,
    },
    headers,
  );
  assert.strictEqual(crossUserSnapshot.status, 410);

  const snapshotConcurrentUpdate = await request(
    '/annotations/save',
    {
      uid: 'snapshot-two',
      url: 'https://example.com/snapshot-two',
      title: 'Snapshot two after update',
      data: { text: 'Snapshot two after update' },
    },
    snapshotHeaders,
  );
  assert.strictEqual(
    snapshotConcurrentUpdate.status,
    201,
    JSON.stringify(snapshotConcurrentUpdate.body),
  );
  const snapshotConcurrentDelete = await request(
    '/annotations/delete',
    { uid: 'snapshot-two' },
    snapshotHeaders,
  );
  assert.strictEqual(
    snapshotConcurrentDelete.status,
    201,
    JSON.stringify(snapshotConcurrentDelete.body),
  );

  const snapshotPageTwo = await request(
    '/annotations/listPage',
    {
      snapshotId: snapshotPageOne.body.snapshotId,
      afterId: snapshotPageOne.body.nextAfterId,
      limit: 1,
    },
    snapshotHeaders,
  );
  assert.strictEqual(
    snapshotPageTwo.status,
    201,
    JSON.stringify(snapshotPageTwo.body),
  );
  assert.strictEqual(snapshotPageTwo.body.list.length, 1);
  assert.strictEqual(snapshotPageTwo.body.list[0].uid, 'snapshot-two');
  assert.strictEqual(
    snapshotPageTwo.body.list[0].title,
    'Snapshot two before update',
  );
  assert.strictEqual(snapshotPageTwo.body.hasMore, false);
  assert.strictEqual(
    snapshotPageTwo.body.annotationChangeHistoryLatestId,
    snapshotPageOne.body.annotationChangeHistoryLatestId,
  );
  const snapshotCatchUp = await request(
    '/annotations/listDiff',
    { sinceId: snapshotPageOne.body.annotationChangeHistoryLatestId },
    snapshotHeaders,
  );
  assert.strictEqual(
    snapshotCatchUp.status,
    201,
    JSON.stringify(snapshotCatchUp.body),
  );
  assert.strictEqual(snapshotCatchUp.body.diff.length, 2);
  assert.strictEqual(
    snapshotCatchUp.body.diff[0].data.title,
    'Snapshot two after update',
  );
  assert.strictEqual(snapshotCatchUp.body.diff[0].kind, 1);
  assert.strictEqual(snapshotCatchUp.body.diff[1].kind, 2);
  assert.strictEqual(snapshotCatchUp.body.diff[1].uid, 'snapshot-two');

  const syncReadUrl = secondaryServerUrl || serverUrl;
  const fullSnapshot = await requestAt(
    syncReadUrl,
    '/annotations/list',
    {},
    headers,
  );
  assert.strictEqual(
    fullSnapshot.status,
    201,
    JSON.stringify(fullSnapshot.body),
  );
  assert.strictEqual(fullSnapshot.body.list.length, 1);
  assert.strictEqual(fullSnapshot.body.list[0].uid, uid);
  assert.strictEqual(
    Number.isInteger(fullSnapshot.body.annotationChangeHistoryLatestId),
    true,
  );

  const listDiff = await requestAt(
    syncReadUrl,
    '/annotations/listDiff',
    { sinceId: 0 },
    headers,
  );
  assert.strictEqual(listDiff.status, 201, JSON.stringify(listDiff.body));
  assert.strictEqual(listDiff.body.ok, true);
  assert.strictEqual(listDiff.body.diff.length, 1);
  assert.strictEqual(listDiff.body.diff[0].kind, 1);
  assert.strictEqual(Object.hasOwn(listDiff.body.diff[0].data, 'user'), false);
  const saveHistoryId = listDiff.body.diff[0].id;
  assert.strictEqual(
    fullSnapshot.body.annotationChangeHistoryLatestId,
    saveHistoryId,
  );

  const update = await request(
    '/annotations/save',
    {
      uid,
      url,
      host: 'example.com',
      title: 'Integration test updated',
      data: {
        text: 'durable searchable text updated',
        notes: 'integration note updated',
      },
    },
    headers,
  );
  assert.strictEqual(update.status, 201, JSON.stringify(update.body));

  const replicaDiff = await requestAt(
    syncReadUrl,
    '/annotations/listDiff',
    { sinceId: saveHistoryId },
    headers,
  );
  assert.strictEqual(replicaDiff.status, 201, JSON.stringify(replicaDiff.body));
  assert.strictEqual(replicaDiff.body.ok, true);
  assert.strictEqual(replicaDiff.body.diff.length, 1);
  assert.strictEqual(replicaDiff.body.diff[0].kind, 1);
  assert.strictEqual(
    Object.hasOwn(replicaDiff.body.diff[0].data, 'user'),
    false,
  );
  assert.strictEqual(
    replicaDiff.body.diff[0].data.title,
    'Integration test updated',
  );
  const updateHistoryId = replicaDiff.body.diff[0].id;

  const byUrl = await request('/annotations/queryByUrl', { url }, headers);
  assert.strictEqual(byUrl.status, 201, JSON.stringify(byUrl.body));
  assert.strictEqual(byUrl.body.list.length, 1);
  assert.strictEqual(byUrl.body.list[0].uid, uid);
  assert.strictEqual(byUrl.body.list[0].title, 'Integration test updated');

  const searchHits = await waitForSearch(headers, 'searchable text', 1);
  assert.strictEqual(searchHits[0].id, byUrl.body.list[0].id);

  const deletion = await request('/annotations/delete', { uid }, headers);
  assert.strictEqual(deletion.status, 201, JSON.stringify(deletion.body));

  const deleteDiff = await request(
    '/annotations/listDiff',
    { sinceId: updateHistoryId },
    headers,
  );
  assert.strictEqual(deleteDiff.status, 201, JSON.stringify(deleteDiff.body));
  assert.strictEqual(deleteDiff.body.ok, true);
  assert.strictEqual(deleteDiff.body.diff.length, 1);
  assert.strictEqual(deleteDiff.body.diff[0].kind, 2);
  assert.strictEqual(
    Object.hasOwn(deleteDiff.body.diff[0].data, 'user'),
    false,
  );
  await assertAnnotationHistoryIsProtected(username);
  await waitForSearch(headers, 'searchable text', 0);

  let rateLimited = false;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await request('/users/login', {
      username: `rate-limit-${attempt}`,
      password: 'incorrect-password',
    });
    if (response.status === 429) {
      rateLimited = true;
      break;
    }
    assert.strictEqual(response.status, 403, JSON.stringify(response.body));
  }
  assert.strictEqual(rateLimited, true, 'login endpoint was not rate limited');

  console.log('Live API integration test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

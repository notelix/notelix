const assert = require('assert');
const { MeiliSearch } = require('meilisearch');
const { Client } = require('pg');
const ormconfig = require('../ormconfig');

const mode = process.argv[2];
const agentServerUrl = new URL(
  process.env.TEST_AGENT_SERVER_URL || 'http://127.0.0.1:18579',
);
const indexName =
  process.env.MEILISEARCH_ANNOTATIONS_INDEX || 'annotations_agent_recovery';
const marker = 'agentsearchrecoverymarker';
const annotationUid = 'agent-search-recovery';
const meili = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST,
  apiKey: process.env.MEILISEARCH_API_KEY,
});

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function databaseClient() {
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();
  return client;
}

async function seedAnnotation() {
  const client = await databaseClient();
  try {
    await client.query(
      `
        INSERT INTO "annotation"
          ("uid", "url", "title", "host", "data", "userId",
           "created_at", "updated_at")
        VALUES ($1, $2, $3, $4, $5, 0, now(), now())
        ON CONFLICT ("userId", "uid") DO UPDATE
        SET "url" = EXCLUDED."url",
            "title" = EXCLUDED."title",
            "host" = EXCLUDED."host",
            "data" = EXCLUDED."data",
            "updated_at" = now()
      `,
      [
        annotationUid,
        'https://example.com/agent-search-recovery',
        'Agent search recovery',
        'example.com',
        { text: marker, notes: 'survives a lost search index' },
      ],
    );
  } finally {
    await client.end();
  }
}

function isIndexMissing(error) {
  return (
    error?.cause?.code === 'index_not_found' ||
    error?.code === 'index_not_found' ||
    String(error?.message || '').includes('index_not_found')
  );
}

async function deleteIndexIfPresent() {
  try {
    const task = await meili.deleteIndex(indexName);
    await meili.tasks.waitForTask(task, { timeout: 30000 });
  } catch (error) {
    if (!isIndexMissing(error)) {
      throw error;
    }
  }
}

async function request(path, body, headers = {}) {
  const response = await fetch(new URL(path, agentServerUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (_error) {
    responseBody = null;
  }
  return { status: response.status, body: responseBody };
}

async function waitForRecoveredSearch() {
  let lastResponse;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      lastResponse = await request('/annotations/search', { q: marker });
      const hits = lastResponse.body?.results?.hits;
      if (
        lastResponse.status === 201 &&
        Array.isArray(hits) &&
        hits.some((hit) => hit.text === marker)
      ) {
        return;
      }
    } catch (_error) {
      // The agent or recreated index may still be starting.
    }
    await sleep(250);
  }
  assert.fail(
    `Agent search did not recover: ${JSON.stringify(lastResponse)}`,
  );
}

async function enableAgentSync() {
  const response = await request(
    '/agentsync/set',
    {
      config: {
        enabled: true,
        url: 'https://notelix.example',
        token: 'agent-search-recovery-token',
        clientSideEncryptionKey: null,
      },
    },
    { Origin: 'chrome-extension://integration-test' },
  );
  assert.strictEqual(response.status, 201, JSON.stringify(response.body));
  assert.deepStrictEqual(response.body, { ok: true, enabled: true });
}

async function main() {
  if (mode === 'prepare') {
    await seedAnnotation();
    await deleteIndexIfPresent();
    console.log('Agent search recovery fixture prepared.');
    return;
  }
  if (mode === 'verify-startup') {
    await waitForRecoveredSearch();
    console.log('Agent startup search rebuild test passed.');
    return;
  }
  if (mode === 'verify-runtime') {
    await deleteIndexIfPresent();
    await enableAgentSync();
    await waitForRecoveredSearch();
    console.log('Agent runtime search rebuild test passed.');
    return;
  }
  throw new Error(
    'usage: node test-agent-search-recovery.js prepare|verify-startup|verify-runtime',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

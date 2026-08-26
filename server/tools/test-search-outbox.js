const assert = require('assert');
const { Client } = require('pg');
const ormconfig = require('../ormconfig');

const mode = process.argv[2];
const serverUrl = process.env.TEST_SERVER_URL || 'http://127.0.0.1:18575';
const staticToken = 's'.repeat(64);
const headers = {
  authorization: `static-token ${staticToken}`,
  'content-type': 'application/json',
};
const uid = 'search-outbox-recovery';
const phrase = 'durable-search-outbox-recovery-phrase';

async function request(path, body) {
  const response = await fetch(new URL(path, serverUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (_error) {
    responseBody = null;
  }
  return { status: response.status, body: responseBody };
}

async function getOutboxRows() {
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT "outbox"."annotation_id", "outbox"."attempt_count"
        FROM "annotation_search_outbox" AS "outbox"
        WHERE "outbox"."annotation_id" IN (
          SELECT "id" FROM "annotation" WHERE "uid" = $1
          UNION
          SELECT "annotationId"
          FROM "annotation_change_history"
          WHERE "uid" = $1
        )
      `,
      [uid],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

async function waitForSearch(expectedHits) {
  let lastResponse;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    lastResponse = await request('/annotations/search', { q: phrase });
    if (
      lastResponse.status === 201 &&
      lastResponse.body?.results?.hits?.length === expectedHits
    ) {
      const outboxRows = await getOutboxRows();
      if (outboxRows.length === 0) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(
    `Search/outbox did not converge to ${expectedHits} hits: ${JSON.stringify(
      lastResponse,
    )}`,
  );
}

async function main() {
  if (mode === 'save') {
    const response = await request('/annotations/save', {
      uid,
      url: 'https://example.com/search-outbox-recovery',
      title: 'Search outbox recovery',
      host: 'example.com',
      data: { text: phrase },
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response));
    assert.strictEqual((await getOutboxRows()).length, 1);
    console.log('Search outbox retained a save while Meilisearch was down.');
    return;
  }

  if (mode === 'verify-save') {
    await waitForSearch(1);
    console.log('Search outbox replayed the saved annotation.');
    return;
  }

  if (mode === 'delete') {
    const response = await request('/annotations/delete', { uid });
    assert.strictEqual(response.status, 201, JSON.stringify(response));
    assert.strictEqual((await getOutboxRows()).length, 1);
    console.log(
      'Search outbox retained a deletion while Meilisearch was down.',
    );
    return;
  }

  if (mode === 'verify-delete') {
    await waitForSearch(0);
    console.log('Search outbox replayed the annotation deletion.');
    return;
  }

  throw new Error(`Unsupported search outbox test mode: ${mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

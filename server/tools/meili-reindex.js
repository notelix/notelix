const ormconfig = require('../ormconfig');
const { createHash, randomBytes } = require('crypto');
const { Client } = require('pg');
const { MeiliSearch } = require('meilisearch');
const {
  readBooleanEnvironment,
  readBoundedIntegerEnvironment,
  readEnvironmentChoice,
} = require('../runtime-config');

const meiliHost = process.env.MEILISEARCH_HOST || 'http://meilisearch:7700';
const indexName = process.env.MEILISEARCH_ANNOTATIONS_INDEX || 'annotations';
const runMode = readEnvironmentChoice('RUN_MODE', 'SERVER', [
  'SERVER',
  'AGENT',
]);
const batchSize = readBoundedIntegerEnvironment(
  'MEILI_REINDEX_BATCH_SIZE',
  500,
  1,
  5000,
);
const updateTimeoutMs = readBoundedIntegerEnvironment(
  'MEILI_REINDEX_TIMEOUT_MS',
  10 * 60 * 1000,
  1000,
  3600000,
);
const updateIntervalMs = readBoundedIntegerEnvironment(
  'MEILI_REINDEX_INTERVAL_MS',
  500,
  100,
  30000,
);
const includeClientSideEncrypted = readBooleanEnvironment(
  'MEILI_REINDEX_INCLUDE_CLIENT_SIDE_ENCRYPTED',
  runMode === 'AGENT',
);

function createPostgresClient() {
  return new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
}

function createMeiliClient() {
  return new MeiliSearch({
    host: meiliHost,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
}

function toMeiliEntry(row) {
  const data = row.data || {};
  return {
    id: row.id,
    text: data.text,
    textBefore: data.textBefore,
    textAfter: data.textAfter,
    color: data.color,
    notes: data.notes,
    userId: row.userId === null ? undefined : row.userId,
    url: row.url,
    title: row.title,
  };
}

function getUpdateId(update) {
  if (!update) {
    return undefined;
  }
  return update.updateId === undefined ? update.taskUid : update.updateId;
}

async function waitForUpdate(client, update) {
  const updateId = getUpdateId(update);
  if (updateId === undefined) {
    return;
  }

  const options = {
    timeout: updateTimeoutMs,
    interval: updateIntervalMs,
  };

  const task = await client.tasks.waitForTask(updateId, options);
  if (task.status !== 'succeeded') {
    throw new Error(
      `Meilisearch task ${task.uid} ${task.status}: ${JSON.stringify(
        task.error,
      )}`,
    );
  }
}

function isMeiliError(error, code) {
  const candidates = [
    error && error.code,
    error && error.errorCode,
    error && error.type,
    error && error.message,
  ].filter(Boolean);

  return candidates.some((candidate) =>
    candidate.toString().toLowerCase().includes(code.toLowerCase()),
  );
}

async function ensureIndex(client, uid = indexName) {
  if (typeof client.createIndex !== 'function') {
    return;
  }

  try {
    await waitForUpdate(
      client,
      await client.createIndex(uid, { primaryKey: 'id' }),
    );
  } catch (error) {
    if (
      !isMeiliError(error, 'already_exists') &&
      !isMeiliError(error, 'already exists')
    ) {
      throw error;
    }
  }
}

async function deleteIndexIfExists(client, uid) {
  try {
    await waitForUpdate(client, await client.deleteIndex(uid));
  } catch (error) {
    if (
      !isMeiliError(error, 'index_not_found') &&
      !isMeiliError(error, 'not found')
    ) {
      throw error;
    }
  }
}

function createReplacementIndexName() {
  const indexDigest = createHash('sha256')
    .update(indexName, 'utf8')
    .digest('hex')
    .slice(0, 12);
  return [
    'notelix_reindex',
    indexDigest,
    Date.now().toString(36),
    process.pid,
    randomBytes(6).toString('hex'),
  ].join('_');
}

async function getAnnotationCounts(client) {
  const result = await client.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE $1::boolean
             OR COALESCE(u.client_side_encryption, '') = ''
             OR a."userId" = 0
             OR a."userId" IS NULL
        )::int AS indexable,
        COUNT(*) FILTER (
          WHERE NOT (
            $1::boolean
            OR COALESCE(u.client_side_encryption, '') = ''
            OR a."userId" = 0
            OR a."userId" IS NULL
          )
        )::int AS skipped
      FROM annotation a
      LEFT JOIN "user" u ON u.id = a."userId";
    `,
    [includeClientSideEncrypted],
  );

  return result.rows[0];
}

async function fetchAnnotationBatch(client, lastId) {
  const result = await client.query(
    `
      SELECT a.id, a.url, a.title, a.data, a."userId" AS "userId"
      FROM annotation a
      LEFT JOIN "user" u ON u.id = a."userId"
      WHERE a.id > $2
        AND (
          $1::boolean
          OR COALESCE(u.client_side_encryption, '') = ''
          OR a."userId" = 0
          OR a."userId" IS NULL
        )
      ORDER BY a.id ASC
      LIMIT $3;
    `,
    [includeClientSideEncrypted, lastId, batchSize],
  );

  return result.rows;
}

async function rebuildIndex(
  postgres,
  meiliClient,
  {
    replacementIndexName = createReplacementIndexName(),
    logger = console,
  } = {},
) {
  const replacementIndex = meiliClient.index(replacementIndexName);
  let operationError;
  let indexed = 0;
  let indexMayExist = false;

  try {
    const counts = await getAnnotationCounts(postgres);
    logger.log(
      `Found ${counts.total} annotations: ${counts.indexable} indexable, ${counts.skipped} skipped.`,
    );
    if (counts.skipped > 0) {
      logger.log(
        'Skipped annotations belong to client-side encrypted users. Reindex them from the agent instead.',
      );
    }

    logger.log(
      `Building replacement Meilisearch index "${replacementIndexName}" at ${meiliHost}`,
    );
    indexMayExist = true;
    await waitForUpdate(
      meiliClient,
      await meiliClient.createIndex(replacementIndexName, {
        primaryKey: 'id',
      }),
    );
    await waitForUpdate(
      meiliClient,
      await replacementIndex.updateSettings({
        filterableAttributes: ['userId'],
      }),
    );

    let lastId = 0;
    while (true) {
      const rows = await fetchAnnotationBatch(postgres, lastId);
      if (rows.length === 0) {
        break;
      }

      lastId = rows[rows.length - 1].id;
      await waitForUpdate(
        meiliClient,
        await replacementIndex.addDocuments(rows.map(toMeiliEntry)),
      );
      indexed += rows.length;
      logger.log(`Indexed ${indexed}/${counts.indexable} annotations`);
    }

    // Meilisearch requires both UIDs to exist before a swap. Creating an empty
    // public index at this late stage keeps a first-time rebuild's empty-index
    // window as short as possible, while an existing public index is untouched.
    await ensureIndex(meiliClient, indexName);
    logger.log(
      `Replacement complete. Atomically swapping it into "${indexName}".`,
    );
    await waitForUpdate(
      meiliClient,
      await meiliClient.swapIndexes([
        { indexes: [indexName, replacementIndexName] },
      ]),
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (indexMayExist) {
      try {
        // Before the swap this removes a partial replacement. After the swap,
        // the same UID contains the superseded public index.
        await deleteIndexIfExists(meiliClient, replacementIndexName);
      } catch (cleanupError) {
        if (!operationError) {
          throw cleanupError;
        }
        logger.warn(
          `Could not remove replacement index "${replacementIndexName}" after the rebuild failed: ${cleanupError.message}`,
        );
      }
    }
  }

  logger.log(`Done. Indexed ${indexed} annotations into "${indexName}".`);
  return indexed;
}

async function main() {
  const postgres = createPostgresClient();
  const meiliClient = createMeiliClient();

  await postgres.connect();
  try {
    await rebuildIndex(postgres, meiliClient);
  } finally {
    await postgres.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  rebuildIndex,
  createReplacementIndexName,
  toMeiliEntry,
};

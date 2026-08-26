const assert = require('assert');
const { rebuildIndex } = require('./meili-reindex');

const liveIndexName =
  process.env.MEILISEARCH_ANNOTATIONS_INDEX || 'annotations';
const silentLogger = {
  log() {},
  warn() {},
};

function createPostgresMock() {
  let batch = 0;
  return {
    async query(sql) {
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ total: 1, indexable: 1, skipped: 0 }] };
      }

      batch += 1;
      return {
        rows:
          batch === 1
            ? [
                {
                  id: 7,
                  url: 'https://example.com/reindex',
                  title: 'Atomic reindex',
                  data: { text: 'replacement document' },
                  userId: 3,
                },
              ]
            : [],
      };
    },
  };
}

function createMeiliMock({ failDocumentAddition = false } = {}) {
  const calls = [];
  let nextTaskUid = 1;
  const task = () => ({ taskUid: nextTaskUid++ });

  return {
    calls,
    tasks: {
      async waitForTask(taskUid) {
        return { uid: taskUid, status: 'succeeded' };
      },
    },
    async createIndex(uid) {
      calls.push(`create:${uid}`);
      if (uid === liveIndexName) {
        const error = new Error(`Index \`${liveIndexName}\` already exists.`);
        error.code = 'index_already_exists';
        throw error;
      }
      return task();
    },
    index(uid) {
      return {
        async updateSettings() {
          calls.push(`settings:${uid}`);
          return task();
        },
        async addDocuments(documents) {
          calls.push(`documents:${uid}:${documents.length}`);
          if (failDocumentAddition) {
            throw new Error('injected document addition failure');
          }
          return task();
        },
      };
    },
    async swapIndexes(swaps) {
      calls.push(`swap:${swaps[0].indexes.join(':')}`);
      return task();
    },
    async deleteIndex(uid) {
      calls.push(`delete:${uid}`);
      return task();
    },
  };
}

async function assertSuccessfulSwap() {
  const meili = createMeiliMock();
  const indexed = await rebuildIndex(createPostgresMock(), meili, {
    replacementIndexName: 'annotations_replacement',
    logger: silentLogger,
  });

  assert.strictEqual(indexed, 1);
  assert.deepStrictEqual(meili.calls, [
    'create:annotations_replacement',
    'settings:annotations_replacement',
    'documents:annotations_replacement:1',
    `create:${liveIndexName}`,
    `swap:${liveIndexName}:annotations_replacement`,
    'delete:annotations_replacement',
  ]);
}

async function assertFailurePreservesLiveIndex() {
  const meili = createMeiliMock({ failDocumentAddition: true });

  await assert.rejects(
    rebuildIndex(createPostgresMock(), meili, {
      replacementIndexName: 'annotations_failed_replacement',
      logger: silentLogger,
    }),
    /injected document addition failure/,
  );

  assert.deepStrictEqual(meili.calls, [
    'create:annotations_failed_replacement',
    'settings:annotations_failed_replacement',
    'documents:annotations_failed_replacement:1',
    'delete:annotations_failed_replacement',
  ]);
  assert.strictEqual(
    meili.calls.some((call) => call.startsWith('swap:')),
    false,
  );
  assert.strictEqual(
    meili.calls.some((call) => call === `delete:${liveIndexName}`),
    false,
  );
}

Promise.all([assertSuccessfulSwap(), assertFailurePreservesLiveIndex()])
  .then(() => {
    console.log('Atomic Meilisearch reindex tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

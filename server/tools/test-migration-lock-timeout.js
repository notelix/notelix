const assert = require('assert');
const { acquireMigrationLock } = require('./run-migrations');

async function assertLockEventuallySucceeds() {
  let attempt = 0;
  let currentTime = 0;
  const waits = [];
  const queryRunner = {
    async query() {
      attempt += 1;
      return [{ acquired: attempt === 3 }];
    },
  };

  await acquireMigrationLock(queryRunner, {
    timeoutMs: 1000,
    retryMs: 250,
    now: () => currentTime,
    wait: async (delay) => {
      waits.push(delay);
      currentTime += delay;
    },
  });

  assert.strictEqual(attempt, 3);
  assert.deepStrictEqual(waits, [250, 250]);
}

async function assertLockTimesOut() {
  let attempts = 0;
  let currentTime = 0;
  const waits = [];
  const queryRunner = {
    async query() {
      attempts += 1;
      return [{ acquired: false }];
    },
  };

  await assert.rejects(
    acquireMigrationLock(queryRunner, {
      timeoutMs: 1000,
      retryMs: 300,
      now: () => currentTime,
      wait: async (delay) => {
        waits.push(delay);
        currentTime += delay;
      },
    }),
    /Timed out after 1000ms waiting for PostgreSQL migration lock/,
  );

  assert.strictEqual(attempts, 4);
  assert.deepStrictEqual(waits, [300, 300, 300, 100]);
  assert.strictEqual(currentTime, 1000);
}

Promise.all([assertLockEventuallySucceeds(), assertLockTimesOut()])
  .then(() => {
    console.log('Migration lock deadline tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

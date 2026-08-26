const assert = require('assert');
const { AppDataSource } = require('../dist/database');

async function expectBoundedFailure(operation, pattern, label) {
  const startedAt = Date.now();
  await assert.rejects(operation, pattern);
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs >= 100, `${label} failed too early after ${elapsedMs}ms`);
  assert.ok(elapsedMs < 3000, `${label} hung for ${elapsedMs}ms`);
}

async function main() {
  await AppDataSource.initialize();
  const heldConnections = [];
  try {
    await expectBoundedFailure(
      AppDataSource.query('SELECT pg_sleep(5)'),
      /statement timeout|query read timeout/i,
      'slow database query',
    );

    for (let index = 0; index < AppDataSource.options.poolSize; index += 1) {
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      heldConnections.push(queryRunner);
    }
    const waitingConnection = AppDataSource.createQueryRunner();
    await expectBoundedFailure(
      waitingConnection.connect(),
      /timeout exceeded when trying to connect/i,
      'database pool acquisition',
    );

    await Promise.all(
      heldConnections.splice(0).map((runner) => runner.release()),
    );
    assert.deepStrictEqual(await AppDataSource.query('SELECT 1 AS healthy'), [
      { healthy: 1 },
    ]);
  } finally {
    await Promise.all(
      heldConnections.splice(0).map((runner) => runner.release()),
    );
    await AppDataSource.destroy();
  }

  console.log('Database operation timeout tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const { AppDataSource } = require('../dist/database');
const { readBoundedIntegerEnvironment } = require('../runtime-config');

const migrationLockName = 'notelix-database-migrations';
const migrationLockRetryMs = 250;
const migrationLockTimeoutMs = readBoundedIntegerEnvironment(
  'DB_MIGRATION_LOCK_TIMEOUT_MS',
  120000,
  1000,
  3600000,
);

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function acquireMigrationLock(
  queryRunner,
  {
    timeoutMs = migrationLockTimeoutMs,
    retryMs = migrationLockRetryMs,
    now = () => performance.now(),
    wait = sleep,
  } = {},
) {
  const startedAt = now();
  while (true) {
    if (now() - startedAt >= timeoutMs) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for PostgreSQL migration lock`,
      );
    }
    const result = await queryRunner.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [migrationLockName],
    );
    if (result[0]?.acquired) {
      return;
    }
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for PostgreSQL migration lock`,
      );
    }
    await wait(Math.min(retryMs, remainingMs));
  }
}

async function main() {
  await AppDataSource.initialize();
  const lockConnection = AppDataSource.createQueryRunner();
  await lockConnection.connect();

  try {
    await acquireMigrationLock(lockConnection);
    const migrations = await AppDataSource.runMigrations({
      transaction: 'each',
    });
    if (migrations.length === 0) {
      console.log('No migrations are pending.');
    } else {
      console.log(
        `Applied migrations: ${migrations
          .map((migration) => migration.name)
          .join(', ')}`,
      );
    }
  } finally {
    try {
      await lockConnection.query('SELECT pg_advisory_unlock(hashtext($1))', [
        migrationLockName,
      ]);
    } finally {
      await lockConnection.release();
      await AppDataSource.destroy();
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { acquireMigrationLock, migrationLockName };

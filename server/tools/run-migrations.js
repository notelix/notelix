const { AppDataSource } = require('../dist/database');

const migrationLockName = 'notelix-database-migrations';
const migrationLockRetryMs = 250;

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function acquireMigrationLock(queryRunner) {
  while (true) {
    const result = await queryRunner.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [migrationLockName],
    );
    if (result[0]?.acquired) {
      return;
    }
    await sleep(migrationLockRetryMs);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

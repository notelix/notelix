const { AppDataSource } = require('../dist/database');

const migrationLockName = 'notelix-database-migrations';

async function main() {
  await AppDataSource.initialize();
  const lockConnection = AppDataSource.createQueryRunner();
  await lockConnection.connect();

  try {
    await lockConnection.query('SELECT pg_advisory_lock(hashtext($1))', [
      migrationLockName,
    ]);
    const migrations = await AppDataSource.runMigrations({
      transaction: 'all',
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

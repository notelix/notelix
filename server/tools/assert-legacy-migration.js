const assert = require('assert');
const { Client } = require('pg');
const ormconfig = require('../ormconfig');

async function main() {
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();

  try {
    const dataCounts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "user") AS users,
        (SELECT COUNT(*)::int FROM "annotation") AS annotations,
        (SELECT COUNT(*)::int FROM "annotation_change_history") AS history,
        (SELECT COUNT(*)::int FROM "static_token") AS tokens
    `);
    assert.deepStrictEqual(dataCounts.rows[0], {
      users: 1,
      annotations: 1,
      history: 1,
      tokens: 1,
    });

    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'UQ_user_name',
          'UQ_annotation_user_uid',
          'IDX_annotation_user_url_host',
          'IDX_history_user',
          'UQ_static_token_token'
        )
    `);
    assert.strictEqual(indexes.rowCount, 5);

    const oldUidConstraint = await client.query(`
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'UQ_cdb349fc80e4559e24315712043'
    `);
    assert.strictEqual(oldUidConstraint.rowCount, 0);

    const foreignKeys = await client.query(`
      SELECT conrelid::regclass::text AS table_name, COUNT(*)::int AS count
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid IN (
          'annotation_change_history'::regclass,
          'static_token'::regclass
        )
      GROUP BY conrelid
      ORDER BY table_name
    `);
    assert.deepStrictEqual(foreignKeys.rows, [
      { table_name: 'annotation_change_history', count: 1 },
      { table_name: 'static_token', count: 1 },
    ]);

    const migrations = await client.query(
      'SELECT "name" FROM "migrations" ORDER BY "id"',
    );
    assert.deepStrictEqual(migrations.rows, [
      { name: 'InitializeProductionSchema1787745600000' },
    ]);

    console.log('Legacy database migration test passed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const assert = require('assert');
const { createHash } = require('crypto');
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
        (SELECT COUNT(*)::int FROM "static_token") AS tokens,
        (SELECT COUNT(*)::int FROM "annotation_search_outbox") AS search_outbox,
        (SELECT COUNT(*)::int FROM "request_rate_limit") AS rate_limits
    `);
    assert.deepStrictEqual(dataCounts.rows[0], {
      users: 1,
      annotations: 1,
      history: 1,
      tokens: 1,
      search_outbox: 1,
      rate_limits: 0,
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
          'IDX_history_user_id',
          'IDX_sync_snapshot_expires',
          'IDX_sync_snapshot_user_expires',
          'IDX_search_outbox_available',
          'IDX_request_rate_limit_expires',
          'UQ_static_token_token'
        )
      ORDER BY indexname
    `);
    assert.deepStrictEqual(
      indexes.rows.map((row) => row.indexname),
      [
        'IDX_annotation_user_url_host',
        'IDX_history_user_id',
        'IDX_request_rate_limit_expires',
        'IDX_search_outbox_available',
        'IDX_sync_snapshot_expires',
        'IDX_sync_snapshot_user_expires',
        'UQ_annotation_user_uid',
        'UQ_static_token_token',
        'UQ_user_name',
      ],
    );

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
          'annotation_sync_snapshot_item'::regclass,
          'static_token'::regclass
        )
      GROUP BY conrelid
      ORDER BY table_name
    `);
    assert.deepStrictEqual(foreignKeys.rows, [
      { table_name: 'annotation_change_history', count: 1 },
      { table_name: 'annotation_sync_snapshot_item', count: 1 },
      { table_name: 'static_token', count: 1 },
    ]);

    const migrations = await client.query(
      'SELECT "name" FROM "migrations" ORDER BY "id"',
    );
    assert.deepStrictEqual(migrations.rows, [
      { name: 'InitializeProductionSchema1787745600000' },
      { name: 'ProtectAuthenticationSecrets1787752800000' },
      { name: 'OptimizeAnnotationSync1787839200000' },
      { name: 'ScrubAnnotationHistorySecrets1787925600000' },
      { name: 'CreateAnnotationSyncSnapshots1788012000000' },
      { name: 'CreateAnnotationSearchOutbox1788098400000' },
      { name: 'CreateRequestRateLimits1788184800000' },
      { name: 'RepairLegacyAnnotationJson1788271200000' },
    ]);

    const annotationPayload = await client.query(
      'SELECT "data" FROM "annotation"',
    );
    assert.deepStrictEqual(annotationPayload.rows, [
      {
        data: {
          emoji: '😀',
          literal: '\\udc61',
          textAfter: '�',
        },
      },
    ]);

    const historyPayload = await client.query(
      'SELECT "data" FROM "annotation_change_history"',
    );
    assert.deepStrictEqual(historyPayload.rows, [
      {
        data: {
          emoji: '😀',
          id: 1,
          literal: '\\udc61',
          textAfter: '�',
          uid: 'legacy-uid',
        },
      },
    ]);
    assert.strictEqual(
      JSON.stringify(historyPayload.rows).includes('legacy-hash'),
      false,
    );

    const legacyToken = 'l'.repeat(64);
    const tokenDigest = createHash('sha256')
      .update(legacyToken, 'utf8')
      .digest('hex');
    const protectedCredentials = await client.query(`
      SELECT
        token."staticToken" AS token_digest,
        account."name" AS user_name,
        account."token_version"
      FROM "static_token" token
      JOIN "user" account ON account."id" = token."userId"
    `);
    assert.deepStrictEqual(protectedCredentials.rows, [
      {
        token_digest: tokenDigest,
        user_name: `guest_1_${tokenDigest.slice(0, 48)}`,
        token_version: 0,
      },
    ]);
    assert.strictEqual(
      JSON.stringify(protectedCredentials.rows).includes(legacyToken),
      false,
    );

    console.log('Legacy database migration test passed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

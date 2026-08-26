const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('pg');
const ormconfig = require('../ormconfig');
const { migrationLockName } = require('./run-migrations');

function runBlockedMigration() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'run-migrations.js')], {
      env: {
        ...process.env,
        DB_MIGRATION_LOCK_TIMEOUT_MS: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('blocked migration process did not exit'));
    }, 5000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, output });
    });
  });
}

async function main() {
  const lockConnection = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    database: ormconfig.database,
    password: ormconfig.password,
    port: ormconfig.port,
    connectionTimeoutMillis: ormconfig.extra.connectionTimeoutMillis,
  });
  await lockConnection.connect();
  try {
    await lockConnection.query(
      'SELECT pg_advisory_lock(hashtext($1))',
      [migrationLockName],
    );
    const startedAt = Date.now();
    const result = await runBlockedMigration();
    const elapsedMs = Date.now() - startedAt;

    assert.strictEqual(result.signal, null);
    assert.notStrictEqual(result.code, 0);
    assert.match(
      result.output,
      /Timed out after 1000ms waiting for PostgreSQL migration lock/,
    );
    assert.ok(elapsedMs >= 900, `migration lock timed out early after ${elapsedMs}ms`);
    assert.ok(elapsedMs < 5000, `migration lock timed out late after ${elapsedMs}ms`);
  } finally {
    await lockConnection.query(
      'SELECT pg_advisory_unlock(hashtext($1))',
      [migrationLockName],
    );
    await lockConnection.end();
  }

  console.log('Live migration lock deadline test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

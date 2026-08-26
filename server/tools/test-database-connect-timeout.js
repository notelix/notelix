const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const startedAt = Date.now();
const result = spawnSync(
  process.execPath,
  [path.join(__dirname, 'ensure-pg-db.js')],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
      DB_CONNECT_TIMEOUT_MS: '1000',
      DB_CONNECT_RETRY_INTERVAL_MS: '100',
    },
    timeout: 5000,
  },
);
const elapsedMs = Date.now() - startedAt;

assert.strictEqual(result.signal, null, 'database timeout check hung');
assert.notStrictEqual(result.status, 0, 'unreachable database was accepted');
assert.match(
  `${result.stdout}\n${result.stderr}`,
  /PostgreSQL at 127\.0\.0\.1:1 was unavailable after 1000ms/,
);
assert.ok(elapsedMs >= 900, `database retry stopped too early after ${elapsedMs}ms`);
assert.ok(elapsedMs < 5000, `database retry stopped too late after ${elapsedMs}ms`);

console.log('Database bootstrap timeout test passed.');

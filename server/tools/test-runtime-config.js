const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const serverEntryPoint = path.join(__dirname, '..', 'dist', 'main.js');
const validEnvironment = {
  ...process.env,
  DB_PORT: '5432',
  PORT: '3000',
  MEILISEARCH_TASK_TIMEOUT_MS: '30000',
  RATE_LIMIT_TTL_MS: '60000',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  TRUST_PROXY_HOPS: '',
};

const cases = [
  {
    name: 'database port',
    environment: { DB_PORT: '5432.5' },
    message: 'DB_PORT must be an integer between 1 and 65535',
  },
  {
    name: 'HTTP port',
    environment: { PORT: '0' },
    message: 'PORT must be an integer between 1 and 65535',
  },
  {
    name: 'Meilisearch task timeout',
    environment: { MEILISEARCH_TASK_TIMEOUT_MS: 'NaN' },
    message:
      'MEILISEARCH_TASK_TIMEOUT_MS must be an integer between 100 and 600000',
  },
  {
    name: 'rate limit duration',
    environment: { RATE_LIMIT_TTL_MS: '1e3' },
    message:
      'RATE_LIMIT_TTL_MS must be an integer between 1 and 2147483647',
  },
  {
    name: 'request body limit',
    environment: { REQUEST_BODY_LIMIT_BYTES: '1e6' },
    message:
      'REQUEST_BODY_LIMIT_BYTES must be an integer between 1024 and 16777216',
  },
  {
    name: 'trusted proxy hops',
    environment: { TRUST_PROXY_HOPS: '1e0' },
    message: 'TRUST_PROXY_HOPS must be an integer between 1 and 10',
  },
];

for (const testCase of cases) {
  const result = spawnSync(process.execPath, [serverEntryPoint], {
    encoding: 'utf8',
    env: { ...validEnvironment, ...testCase.environment },
    timeout: 5000,
  });
  assert.strictEqual(result.signal, null, `${testCase.name} check timed out`);
  assert.notStrictEqual(result.status, 0, `${testCase.name} was accepted`);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    new RegExp(testCase.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
}

console.log('Runtime configuration startup rejection tests passed.');

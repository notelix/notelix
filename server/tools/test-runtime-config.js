const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const serverEntryPoint = path.join(__dirname, '..', 'dist', 'main.js');
const reindexEntryPoint = path.join(__dirname, 'meili-reindex.js');
const validEnvironment = {
  ...process.env,
  DB_PORT: '5432',
  PORT: '3000',
  MEILISEARCH_TASK_TIMEOUT_MS: '30000',
  RATE_LIMIT_TTL_MS: '60000',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  ANNOTATION_RESPONSE_LIMIT_BYTES: '33554432',
  ANNOTATION_HISTORY_MAX_ENTRIES_PER_USER: '10000',
  ANNOTATION_HISTORY_MAX_PAYLOAD_BYTES_PER_USER: '67108864',
  TRUST_PROXY_HOPS: '',
  RUN_MODE: 'SERVER',
  JWT_EXPIRES_IN: '30d',
};

const cases = [
  {
    name: 'database port',
    environment: { DB_PORT: '5432.5' },
    message: 'DB_PORT must be an integer between 1 and 65535',
  },
  {
    name: 'database pool size',
    environment: { DB_POOL_MAX: '0' },
    message: 'DB_POOL_MAX must be an integer between 1 and 100',
  },
  {
    name: 'database pool acquisition timeout',
    environment: { DB_POOL_ACQUIRE_TIMEOUT_MS: '1e3' },
    message:
      'DB_POOL_ACQUIRE_TIMEOUT_MS must be an integer between 100 and 600000',
  },
  {
    name: 'database query timeout',
    environment: { DB_QUERY_TIMEOUT_MS: '0' },
    message: 'DB_QUERY_TIMEOUT_MS must be an integer between 100 and 3600000',
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
    name: 'Meilisearch request timeout',
    environment: { MEILISEARCH_REQUEST_TIMEOUT_MS: '600001' },
    message:
      'MEILISEARCH_REQUEST_TIMEOUT_MS must be an integer between 100 and 600000',
  },
  {
    name: 'rate limit duration',
    environment: { RATE_LIMIT_TTL_MS: '1e3' },
    message: 'RATE_LIMIT_TTL_MS must be an integer between 1 and 2147483647',
  },
  {
    name: 'request body limit',
    environment: { REQUEST_BODY_LIMIT_BYTES: '1e6' },
    message:
      'REQUEST_BODY_LIMIT_BYTES must be an integer between 1024 and 16777216',
  },
  {
    name: 'annotation response budget',
    environment: { ANNOTATION_RESPONSE_LIMIT_BYTES: '1114112' },
    message:
      'ANNOTATION_RESPONSE_LIMIT_BYTES must exceed REQUEST_BODY_LIMIT_BYTES by at least 65536 bytes',
  },
  {
    name: 'annotation history entry limit',
    environment: { ANNOTATION_HISTORY_MAX_ENTRIES_PER_USER: '0' },
    message:
      'ANNOTATION_HISTORY_MAX_ENTRIES_PER_USER must be an integer between 1 and 1000000',
  },
  {
    name: 'annotation history payload limit',
    environment: { ANNOTATION_HISTORY_MAX_PAYLOAD_BYTES_PER_USER: '1048575' },
    message:
      'ANNOTATION_HISTORY_MAX_PAYLOAD_BYTES_PER_USER must be an integer between 1048576 and 17179869184',
  },
  {
    name: 'trusted proxy hops',
    environment: { TRUST_PROXY_HOPS: '1e0' },
    message: 'TRUST_PROXY_HOPS must be an integer between 1 and 10',
  },
  {
    name: 'run mode',
    environment: { RUN_MODE: 'agent' },
    message: 'RUN_MODE must be one of: SERVER, AGENT',
  },
  {
    name: 'agent control origin allowlist',
    environment: { RUN_MODE: 'AGENT', AGENT_CONTROL_ORIGINS: '' },
    message:
      'AGENT_CONTROL_ORIGINS must contain one or more comma-separated chrome-extension:// or moz-extension:// origins when RUN_MODE=AGENT',
  },
  {
    name: 'JWT expiration',
    environment: { JWT_EXPIRES_IN: '120' },
    message:
      'JWT_EXPIRES_IN must be a positive duration with a unit, such as 15m or 30d',
  },
  {
    name: 'reindex batch size',
    entryPoint: reindexEntryPoint,
    environment: { MEILI_REINDEX_BATCH_SIZE: '1e3' },
    message: 'MEILI_REINDEX_BATCH_SIZE must be an integer between 1 and 5000',
  },
  {
    name: 'reindex encryption switch',
    entryPoint: reindexEntryPoint,
    environment: { MEILI_REINDEX_INCLUDE_CLIENT_SIDE_ENCRYPTED: 'maybe' },
    message:
      'MEILI_REINDEX_INCLUDE_CLIENT_SIDE_ENCRYPTED must be true or false',
  },
];

for (const testCase of cases) {
  const result = spawnSync(
    process.execPath,
    [testCase.entryPoint || serverEntryPoint],
    {
      encoding: 'utf8',
      env: { ...validEnvironment, ...testCase.environment },
      timeout: 5000,
    },
  );
  assert.strictEqual(result.signal, null, `${testCase.name} check timed out`);
  assert.notStrictEqual(result.status, 0, `${testCase.name} was accepted`);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    new RegExp(testCase.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
}

console.log('Runtime configuration startup rejection tests passed.');

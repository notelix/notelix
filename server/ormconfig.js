const {
  readBoundedIntegerEnvironment,
  readPortEnvironment,
} = require('./runtime-config');

const poolSize = readBoundedIntegerEnvironment('DB_POOL_MAX', 10, 1, 100);
const poolAcquireTimeoutMs = readBoundedIntegerEnvironment(
  'DB_POOL_ACQUIRE_TIMEOUT_MS',
  5000,
  100,
  600000,
);
const queryTimeoutMs = readBoundedIntegerEnvironment(
  'DB_QUERY_TIMEOUT_MS',
  60000,
  100,
  3600000,
);

module.exports = {
  type: 'postgres',
  host: process.env.DB_HOST || 'postgres',
  port: readPortEnvironment('DB_PORT', 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'notelix',
  poolSize,
  extra: {
    connectionTimeoutMillis: poolAcquireTimeoutMs,
    // PostgreSQL cancels execution, while node-postgres also bounds a stalled
    // network read and tears down a blocked pipelined connection.
    statement_timeout: queryTimeoutMs,
    query_timeout: queryTimeoutMs,
  },
};

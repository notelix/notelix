const ormconfig = require('../ormconfig');
const { Client } = require('pg');
const {
  readBooleanEnvironment,
  readBoundedIntegerEnvironment,
} = require('../runtime-config');

const retryableConnectionCodes = new Set([
  '57P03',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function readBoolean(name, fallback) {
  return readBooleanEnvironment(name, fallback);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function clientOptions(database) {
  return {
    user: ormconfig.username,
    host: ormconfig.host,
    database,
    password: ormconfig.password,
    port: ormconfig.port,
  };
}

async function connectToDatabase(database, allowMissing = false) {
  const connectTimeoutMs = readBoundedIntegerEnvironment(
    'DB_CONNECT_TIMEOUT_MS',
    120000,
    1000,
    3600000,
  );
  const retryIntervalMs = readBoundedIntegerEnvironment(
    'DB_CONNECT_RETRY_INTERVAL_MS',
    1000,
    100,
    30000,
  );
  const deadline = Date.now() + connectTimeoutMs;
  while (true) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const client = new Client({
      ...clientOptions(database),
      connectionTimeoutMillis: Math.min(5000, remainingMs),
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (allowMissing && error.code === '3D000') {
        return null;
      }
      if (!retryableConnectionCodes.has(error.code)) {
        throw error;
      }
      const retryDelayMs = Math.min(retryIntervalMs, deadline - Date.now());
      if (retryDelayMs <= 0) {
        throw new Error(
          `PostgreSQL at ${ormconfig.host}:${ormconfig.port} was unavailable after ${connectTimeoutMs}ms`,
          { cause: error },
        );
      }
      console.log(
        `waiting for PostgreSQL at ${ormconfig.host}:${ormconfig.port}`,
      );
      await sleep(retryDelayMs);
    }
  }
}

async function ensureDatabase() {
  const autoCreate = readBoolean('DB_AUTO_CREATE', true);
  const targetClient = await connectToDatabase(ormconfig.database, true);
  if (targetClient) {
    console.log(`${ormconfig.database} database already exists`);
    await targetClient.end();
    return;
  }

  if (!autoCreate) {
    throw new Error(
      `${ormconfig.database} database does not exist and DB_AUTO_CREATE is disabled`,
    );
  }

  const adminDatabase = process.env.DB_ADMIN_DATABASE || 'postgres';
  const adminClient = await connectToDatabase(adminDatabase);
  let lockAcquired = false;
  try {
    const lockName = `notelix-create-database:${ormconfig.database}`;
    await adminClient.query(
      'SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [lockName],
    );
    lockAcquired = true;

    const existing = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [ormconfig.database],
    );
    if (existing.rowCount > 0) {
      console.log(`${ormconfig.database} database already exists`);
      return;
    }

    const databaseIdentifier = quoteIdentifier(ormconfig.database);
    const ownerIdentifier = quoteIdentifier(ormconfig.username);
    await adminClient.query(
      `CREATE DATABASE ${databaseIdentifier} WITH OWNER ${ownerIdentifier}`,
    );
    console.log(`${ormconfig.database} database created`);
  } finally {
    try {
      if (lockAcquired) {
        await adminClient.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
          [`notelix-create-database:${ormconfig.database}`],
        );
      }
    } finally {
      await adminClient.end();
    }
  }
}

if (require.main === module) {
  ensureDatabase().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { ensureDatabase, quoteIdentifier, readBoolean };

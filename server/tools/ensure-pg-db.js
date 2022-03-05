const ormconfig = require('../ormconfig');
const { Client } = require('pg');
const net = require('net');

// https://github.com/sindresorhus/is-port-reachable/blob/main/license
async function isPortReachable(port, { host, timeout = 1000 } = {}) {
  if (typeof host !== 'string') {
    throw new TypeError('Specify a `host`');
  }

  const promise = new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const onError = () => {
      socket.destroy();
      reject();
    };

    socket.setTimeout(timeout);
    socket.once('error', onError);
    socket.once('timeout', onError);

    socket.connect(port, host, () => {
      socket.end();
      resolve();
    });
  });

  try {
    await promise;
    return true;
  } catch {
    return false;
  }
}

function sleep(delay) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), delay);
  });
}

(async () => {
  while (true) {
    console.log('checking postgres port reachable..');
    const result = await isPortReachable(ormconfig.port, {
      host: ormconfig.host,
      timeout: 1000,
    });
    if (result) {
      console.log('postgres port reachable');
      break;
    } else {
      console.log('postgres port not reachable yet..');
    }
  }

  await sleep(3000);
  const client = new Client({
    user: ormconfig.username,
    host: ormconfig.host,
    password: ormconfig.password,
    port: ormconfig.port,
  });
  await client.connect();

  const existingDatabases = await client.query(
    'SELECT datname FROM pg_database WHERE datistemplate = false;',
  );

  if (existingDatabases.rows.some((x) => x.datname === 'notelix')) {
    console.log('notelix database already exists');
  } else {
    await client.query(
      `CREATE DATABASE "${ormconfig.database}"
     WITH OWNER "postgres" 
     ENCODING 'UTF8' 
     LC_COLLATE = 'en_US.utf8' 
     LC_CTYPE = 'en_US.utf8';`,
    );
  }
  await client.end();
})();

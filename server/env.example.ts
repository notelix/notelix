export default {
  mysqlConfig: require('../ormconfig'),
  typeSenseSearchConfig: {
    nodes: [
      {
        host: 'localhost',
        port: '8108',
        protocol: 'http',
      },
    ],
    apiKey: 'Hu52dwsas2AdxdE',
    numRetries: 3,
    connectionTimeoutSeconds: 120,
    logLevel: 'debug',
  },
};

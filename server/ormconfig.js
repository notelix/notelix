const { readPortEnvironment } = require('./runtime-config');

module.exports = {
  type: 'postgres',
  host: process.env.DB_HOST || 'postgres',
  port: readPortEnvironment('DB_PORT', 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'notelix',
};

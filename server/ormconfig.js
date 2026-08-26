const path = require('path');

module.exports = {
  type: 'postgres',
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'notelix',
  entities: [
    process.env.TYPEORM_ENTITIES ||
      path.join(__dirname, 'dist/models/*.entity.js'),
  ],
};

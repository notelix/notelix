module.exports = {
  type: 'postgres',
  host: '127.0.0.1',
  port: 18555,
  username: 'postgres',
  password: '123456',
  database: 'notelix',
  entities: ['./dist/src/models/**/*.entity.js'],
};

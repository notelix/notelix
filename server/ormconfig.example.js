module.exports = {
  type: 'postgres',
  host: 'postgres',
  port: 5432,
  username: 'postgres',
  password: '123456',
  database: 'notelix',
  entities: ['./dist/src/models/**/*.entity.js'],
};

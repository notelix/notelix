module.exports = {
    type: 'postgres',
    host: 'postgres',
    port: 5432,
    username: 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'notelix',
    entities: ['/app/dist/models/*.entity.js'],
};

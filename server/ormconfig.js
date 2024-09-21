module.exports = {
  type: 'postgres',
  // host: 'postgres',
  // port: 5432,
  // username: 'postgres',
  // password: process.env.DB_PASSWORD,
  // database: 'notelix',
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  port: 6543,
  username: 'postgres.zcbvihahgaqwivvnxufr',
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  entities: ['/app/dist/models/*.entity.js'],
};

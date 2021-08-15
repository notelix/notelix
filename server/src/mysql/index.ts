import { createConnection } from 'typeorm';
import env from '../../env';

export async function bootstrapMySQL() {
  await createConnection({
    ...env.mysqlConfig,
    synchronize: false,
  });
}

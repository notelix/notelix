import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ormConfig from '../ormconfig';
import { Annotation } from './models/annotation.entity';
import { AnnotationChangeHistory } from './models/annotationChangeHistory.entity';
import { JwtPrivateKey } from './models/jwtPrivateKey.entity';
import { StaticToken } from './models/staticToken.entity';
import { User } from './models/user.entity';
import { InitializeProductionSchema1787745600000 } from './migrations/1787745600000-InitializeProductionSchema';

export const AppDataSource = new DataSource({
  ...ormConfig,
  entities: [
    Annotation,
    AnnotationChangeHistory,
    JwtPrivateKey,
    StaticToken,
    User,
  ],
  logging: process.env.TYPEORM_LOGGING === 'true',
  migrations: [InitializeProductionSchema1787745600000],
  synchronize: false,
});

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

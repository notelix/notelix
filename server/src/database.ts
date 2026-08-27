import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ormConfig from '../ormconfig';
import { Annotation } from './models/annotation.entity';
import { AnnotationChangeHistory } from './models/annotationChangeHistory.entity';
import { JwtPrivateKey } from './models/jwtPrivateKey.entity';
import { StaticToken } from './models/staticToken.entity';
import { User } from './models/user.entity';
import { InitializeProductionSchema1787745600000 } from './migrations/1787745600000-InitializeProductionSchema';
import { ProtectAuthenticationSecrets1787752800000 } from './migrations/1787752800000-ProtectAuthenticationSecrets';
import { OptimizeAnnotationSync1787839200000 } from './migrations/1787839200000-OptimizeAnnotationSync';
import { ScrubAnnotationHistorySecrets1787925600000 } from './migrations/1787925600000-ScrubAnnotationHistorySecrets';
import { CreateAnnotationSyncSnapshots1788012000000 } from './migrations/1788012000000-CreateAnnotationSyncSnapshots';
import { CreateAnnotationSearchOutbox1788098400000 } from './migrations/1788098400000-CreateAnnotationSearchOutbox';
import { CreateRequestRateLimits1788184800000 } from './migrations/1788184800000-CreateRequestRateLimits';

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
  migrations: [
    InitializeProductionSchema1787745600000,
    ProtectAuthenticationSecrets1787752800000,
    OptimizeAnnotationSync1787839200000,
    ScrubAnnotationHistorySecrets1787925600000,
    CreateAnnotationSyncSnapshots1788012000000,
    CreateAnnotationSearchOutbox1788098400000,
    CreateRequestRateLimits1788184800000,
  ],
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

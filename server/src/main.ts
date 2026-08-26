import { APP_GUARD, NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { AuthenticationService } from './authenticators/authentication.service';
import { AnnotationsController } from './controllers/annotations.controller';
import { MetaController } from './controllers/meta.controller';
import JwtService from './services/jwt';
import JwtAuth from './authenticators/authenticators/jwtAuth';
import StaticTokenAuth from './authenticators/authenticators/staticTokenAuth';
import AnnotationChangeHistoryService from './services/annotationChangeHistory';
import { ReadinessService } from './services/readiness';
import { AgentSyncController } from './controllers/agentSyncController';
import { bootstrapMeiliSearch } from './meilisearch';
import { AppDataSource, DatabaseLifecycle } from './database';
import { configureApplication } from './application';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  AnnotationSearchSyncService,
  enqueueAllAnnotationSearchUpdates,
} from './services/annotationSearchSync';
import { rebuildAgentAnnotationSearchIndex } from './services/agentSearchIndex';
import {
  readBoundedIntegerEnvironment,
  readEnvironmentChoice,
  readPortEnvironment,
} from '../runtime-config';
import { validateAgentControlOrigins } from './agentControl';

const httpPort = readPortEnvironment('PORT', 3000);
const runMode = readEnvironmentChoice('RUN_MODE', 'SERVER', [
  'SERVER',
  'AGENT',
] as const);
validateAgentControlOrigins(runMode);

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: readBoundedIntegerEnvironment(
          'RATE_LIMIT_TTL_MS',
          60000,
          1,
          2147483647,
        ),
        limit: readBoundedIntegerEnvironment('RATE_LIMIT_MAX', 300, 1, 1000000),
      },
    ]),
  ],
  controllers: [
    UsersController,
    AnnotationsController,
    MetaController,
    AgentSyncController,
  ],
  providers: [
    AuthenticationService,
    JwtService,
    JwtAuth,
    StaticTokenAuth,
    AnnotationChangeHistoryService,
    AnnotationSearchSyncService,
    ReadinessService,
    DatabaseLifecycle,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
class AppModule {}

export async function bootstrapSQL() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

async function bootstrap() {
  await bootstrapSQL();
  await bootstrapMeiliSearch(
    runMode === 'AGENT'
      ? rebuildAgentAnnotationSearchIndex
      : () => enqueueAllAnnotationSearchUpdates(AppDataSource.manager),
  );
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApplication(app);
  await app.listen(httpPort);
}

bootstrap();

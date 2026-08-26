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

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: readPositiveInteger('RATE_LIMIT_TTL_MS', 60000),
        limit: readPositiveInteger('RATE_LIMIT_MAX', 300),
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
  await bootstrapMeiliSearch();
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  await app.listen(Number(process.env.PORT || 3000));
}

bootstrap();

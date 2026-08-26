import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { AuthenticationService } from './authenticators/authentication.service';
import { AnnotationsController } from './controllers/annotations.controller';
import { MetaController } from './controllers/meta.controller';
import JwtService from './services/jwt';
import JwtAuth from './authenticators/authenticators/jwtAuth';
import StaticTokenAuth from './authenticators/authenticators/staticTokenAuth';
import AnnotationChangeHistoryService from './services/annotationChangeHistory';
import { AgentSyncController } from './controllers/agentSyncController';
import { bootstrapMeiliSearch } from './meilisearch';
import { AppDataSource, DatabaseLifecycle } from './database';

@Module({
  imports: [],
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
    DatabaseLifecycle,
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
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000));
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { AuthenticationService } from './authenticators/authentication.service';
import { AnnotationsController } from './controllers/annotations.controller';
import { MetaController } from './controllers/meta.controller';
import JwtService from './services/jwt';
import JwtAuth from './authenticators/authenticators/jwtAuth';
import BearerAuth from './authenticators/authenticators/bearerAuth';
import AnnotationChangeHistoryService from './services/annotationChangeHistory';
import { AgentSyncController } from './controllers/agentSyncController';
import { createConnection } from 'typeorm';
import * as ormConfig from '../ormconfig';
import { bootstrapMeiliSearch } from './meilisearch';

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
    BearerAuth,
    AnnotationChangeHistoryService,
  ],
})
class AppModule {}

export async function bootstrapSQL() {
  await createConnection({
    ...ormConfig,

    synchronize: false,
  });
}

async function bootstrap() {
  await bootstrapSQL();
  await bootstrapMeiliSearch();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3000);
}

bootstrap();

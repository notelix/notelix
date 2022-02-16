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
import { EdgeSyncController } from './controllers/edgesync.controller';
import { createConnection } from 'typeorm';
import * as ormConfig from '../ormconfig';

@Module({
  imports: [],
  controllers: [
    UsersController,
    AnnotationsController,
    MetaController,
    EdgeSyncController,
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
  console.log('@ormConfig', ormConfig);
  await createConnection({
    ...ormConfig,

    synchronize: false,
  });
}

async function bootstrap() {
  await bootstrapSQL();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3000);
}

bootstrap();

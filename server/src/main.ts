import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { AuthenticationService } from './authenticators/authentication.service';
import { AnnotationsController } from './controllers/annotations.controller';
import { bootstrapMySQL } from './mysql';
import { bootstrapTypeSense } from './typesense';
import { MetaController } from './controllers/meta.controller';
import JwtService from './services/jwt';
import JwtAuth from './authenticators/authenticators/jwtAuth';
import BearerAuth from './authenticators/authenticators/bearerAuth';

@Module({
  imports: [],
  controllers: [UsersController, AnnotationsController, MetaController],
  providers: [AuthenticationService, JwtService, JwtAuth, BearerAuth],
})
class AppModule {}

async function bootstrap() {
  await bootstrapMySQL();
  await bootstrapTypeSense();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3000);
}

bootstrap();

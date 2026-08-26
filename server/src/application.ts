import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { isAgentControlOriginAllowed } from './agentControl';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });
}

function getCorsOrigins(): string | string[] {
  const configuredOrigins = process.env.CORS_ORIGINS;
  if (!configuredOrigins || configuredOrigins.trim() === '*') {
    return '*';
  }

  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function configureApplication(app: INestApplication): void {
  app.use(helmet());
  app.useGlobalPipes(createValidationPipe());
  if (process.env.RUN_MODE === 'AGENT' && !process.env.CORS_ORIGINS) {
    app.enableCors({
      origin: (origin, callback) =>
        callback(null, isAgentControlOriginAllowed(origin)),
    });
  } else {
    app.enableCors({ origin: getCorsOrigins() });
  }
  app.enableShutdownHooks();
}

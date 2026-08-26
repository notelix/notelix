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

function configureTrustedProxy(app: INestApplication): void {
  const configuredHops = process.env.TRUST_PROXY_HOPS;
  if (!configuredHops) {
    return;
  }
  const hops = Number(configuredHops);
  if (!Number.isInteger(hops) || hops < 1 || hops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 1 and 10');
  }
  const server = app.getHttpAdapter().getInstance();
  if (typeof server.set !== 'function') {
    throw new Error('TRUST_PROXY_HOPS requires the Express HTTP adapter');
  }
  server.set('trust proxy', hops);
}

export function configureApplication(app: INestApplication): void {
  configureTrustedProxy(app);
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

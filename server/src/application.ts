import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { isAgentControlOriginAllowed, isRunModeAgent } from './agentControl';
import { readBoundedIntegerEnvironment } from '../runtime-config';
import { join } from 'node:path';
import { ServerResponse } from 'node:http';

export const requestBodyLimitBytes = readBoundedIntegerEnvironment(
  'REQUEST_BODY_LIMIT_BYTES',
  1024 * 1024,
  1024,
  16 * 1024 * 1024,
);
const trustedProxyHops = process.env.TRUST_PROXY_HOPS
  ? readBoundedIntegerEnvironment('TRUST_PROXY_HOPS', 1, 1, 10)
  : null;

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
  if (trustedProxyHops === null) {
    return;
  }
  const server = app.getHttpAdapter().getInstance();
  if (typeof server.set !== 'function') {
    throw new Error('TRUST_PROXY_HOPS requires the Express HTTP adapter');
  }
  server.set('trust proxy', trustedProxyHops);
}

export function setStaticAssetHeaders(
  response: ServerResponse,
  filePath: string,
): void {
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  if (normalizedFilePath.endsWith('.html')) {
    response.setHeader('Cache-Control', 'no-cache');
  }
  if (normalizedFilePath.endsWith('/embedded/content-script.dist.js')) {
    response.removeHeader('Content-Security-Policy');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Access-Control-Allow-Origin', '*');
  }
}

export function configureApplication(app: NestExpressApplication): void {
  configureTrustedProxy(app);
  app.useBodyParser('json', { limit: requestBodyLimitBytes });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: requestBodyLimitBytes,
  });
  app.use(helmet());
  if (!isRunModeAgent()) {
    app.useStaticAssets(join(process.cwd(), 'public'), {
      extensions: ['html'],
      index: 'index.html',
      maxAge: '1h',
      redirect: true,
      setHeaders: setStaticAssetHeaders,
    });
  }
  app.useGlobalPipes(createValidationPipe());
  if (isRunModeAgent()) {
    app.enableCors({
      origin: (origin, callback) =>
        callback(null, isAgentControlOriginAllowed(origin)),
    });
  } else {
    app.enableCors({ origin: getCorsOrigins() });
  }
  app.enableShutdownHooks();
}

import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import {
  configureApplication,
  setStaticAssetHeaders,
} from '../src/application';
import { ServerResponse } from 'node:http';

describe('Product website', () => {
  let app: NestExpressApplication;
  const previousRunMode = process.env.RUN_MODE;

  beforeAll(async () => {
    process.env.RUN_MODE = 'SERVER';
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousRunMode === undefined) {
      delete process.env.RUN_MODE;
    } else {
      process.env.RUN_MODE = previousRunMode;
    }
  });

  it('serves the product homepage with security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    expect(response.text).toContain('Remember the ideas');
    expect(response.text).toContain('id="product"');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['cache-control']).toContain('no-cache');
  });

  it('serves clean privacy and embedded routes', async () => {
    await request(app.getHttpServer())
      .get('/privacy')
      .expect(200)
      .expect('Content-Type', /text\/html/)
      .expect(/Your data follows/);

    await request(app.getHttpServer())
      .get('/embedded/')
      .expect(200)
      .expect('Content-Type', /text\/html/)
      .expect(/Interactive playground/);
  });

  it('serves cacheable local assets without external dependencies', async () => {
    const stylesheet = await request(app.getHttpServer())
      .get('/assets/site.css')
      .expect(200)
      .expect('Content-Type', /text\/css/);

    expect(stylesheet.headers['cache-control']).toContain('max-age=3600');
    expect(stylesheet.text).toContain('--violet');

    await request(app.getHttpServer())
      .get('/assets/site.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
  });

  it('allows only the published embedded bundle to load cross-origin', () => {
    const headers = new Map<string, string | number | readonly string[]>();
    headers.set('content-security-policy', "script-src 'self'");
    const response = {
      removeHeader: (name: string) => {
        headers.delete(name.toLowerCase());
      },
      setHeader: (name: string, value: string | number | readonly string[]) => {
        headers.set(name.toLowerCase(), value);
      },
    } as unknown as ServerResponse;

    setStaticAssetHeaders(
      response,
      '/app/public/embedded/content-script.dist.js',
    );

    expect(headers.has('content-security-policy')).toBe(false);
    expect(headers.get('cache-control')).toBe('no-cache');
    expect(headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(headers.get('access-control-allow-origin')).toBe('*');

    headers.clear();
    headers.set('content-security-policy', "script-src 'self'");
    setStaticAssetHeaders(response, '/app/public/assets/site.js');
    expect(headers.get('content-security-policy')).toBe("script-src 'self'");
    expect(headers.has('cross-origin-resource-policy')).toBe(false);
    expect(headers.has('access-control-allow-origin')).toBe(false);
  });
});

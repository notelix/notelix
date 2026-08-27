import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { configureApplication } from '../src/application';

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
});

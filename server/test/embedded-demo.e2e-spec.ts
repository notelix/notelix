import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { EmbeddedDemoController } from '../src/controllers/embeddedDemo.controller';
import { readEmbeddedDemoStaticToken } from '../src/embeddedDemo';

describe('Persistent embedded demo', () => {
  const staticToken = 'd'.repeat(64);
  const originalStaticToken = process.env.EMBEDDED_DEMO_STATIC_TOKEN;
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.EMBEDDED_DEMO_STATIC_TOKEN = staticToken;
    const moduleRef = await Test.createTestingModule({
      controllers: [EmbeddedDemoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalStaticToken === undefined) {
      delete process.env.EMBEDDED_DEMO_STATIC_TOKEN;
    } else {
      process.env.EMBEDDED_DEMO_STATIC_TOKEN = originalStaticToken;
    }
  });

  it('validates the opt-in shared guest token', () => {
    expect(readEmbeddedDemoStaticToken({})).toBeNull();
    expect(
      readEmbeddedDemoStaticToken({ EMBEDDED_DEMO_STATIC_TOKEN: staticToken }),
    ).toBe(staticToken);
    expect(() =>
      readEmbeddedDemoStaticToken({
        EMBEDDED_DEMO_STATIC_TOKEN: 'not-a-valid-token',
      }),
    ).toThrow('exactly 64 lowercase hexadecimal characters');
  });

  it('publishes one non-cacheable identity for every demo device', async () => {
    const first = await request(app.getHttpServer())
      .get('/embedded/demo-session.js')
      .expect(200)
      .expect('Content-Type', /javascript/)
      .expect('Cache-Control', 'no-store')
      .expect('Pragma', 'no-cache');
    const second = await request(app.getHttpServer())
      .get('/embedded/demo-session.js')
      .expect(200);

    expect(first.text).toContain(JSON.stringify(staticToken));
    expect(second.text).toEqual(first.text);
  });

  it('falls back to an isolated reload-only identity when persistence is disabled', async () => {
    await app.close();
    delete process.env.EMBEDDED_DEMO_STATIC_TOKEN;

    const moduleRef = await Test.createTestingModule({
      controllers: [EmbeddedDemoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();

    const first = await request(app.getHttpServer())
      .get('/embedded/demo-session.js')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/embedded/demo-session.js')
      .expect(200);

    expect(first.text).toContain('demoLocalOnly: true');
    expect(second.text).toContain('demoLocalOnly: true');
    expect(second.text).not.toEqual(first.text);
  });
});

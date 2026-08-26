import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { createValidationPipe } from '../src/application';
import { AgentSyncController } from '../src/controllers/agentSyncController';

describe('Agent control API', () => {
  let app: INestApplication;
  const originalRunMode = process.env.RUN_MODE;

  const validConfig = {
    enabled: true,
    url: 'https://notelix.example',
    token: 'signed-jwt',
    clientSideEncryptionKey: null,
  };

  beforeEach(async () => {
    delete process.env.RUN_MODE;
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentSyncController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    if (originalRunMode === undefined) {
      delete process.env.RUN_MODE;
    } else {
      process.env.RUN_MODE = originalRunMode;
    }
    await app.close();
  });

  it('rejects agent commands when the server is not in agent mode', async () => {
    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(403);
  });

  it('rejects website origins in agent mode', async () => {
    process.env.RUN_MODE = 'AGENT';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'https://malicious.example')
      .send({ config: validConfig })
      .expect(403);
  });

  it('accepts extension origins without echoing secrets', async () => {
    process.env.RUN_MODE = 'AGENT';

    const response = await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(201);

    expect(response.body).toEqual({ ok: true, enabled: true });
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('clientSideEncryptionKey');
  });

  it('validates agent configuration fields', async () => {
    process.env.RUN_MODE = 'AGENT';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({
        config: {
          ...validConfig,
          url: 'file:///etc/passwd',
        },
      })
      .expect(400);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { MetaController } from '../src/controllers/meta.controller';
import { ReadinessService } from '../src/services/readiness';

describe('Meta API', () => {
  let app: INestApplication;
  let readinessService: {
    check: jest.Mock;
    isAcceptingTraffic: jest.Mock;
  };

  beforeEach(async () => {
    readinessService = {
      check: jest.fn(),
      isAcceptingTraffic: jest.fn().mockReturnValue(true),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [MetaController],
      providers: [
        {
          provide: ReadinessService,
          useValue: readinessService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports liveness without checking dependencies', async () => {
    await request(app.getHttpServer())
      .get('/meta/health')
      .expect(200, { status: 'ok' });
    expect(readinessService.check).not.toHaveBeenCalled();
  });

  it('reports readiness when all dependencies are up', async () => {
    readinessService.check.mockResolvedValue({
      postgres: 'up',
      meilisearch: 'up',
    });

    await request(app.getHttpServer())
      .get('/meta/ready')
      .expect(200, {
        status: 'ok',
        checks: { postgres: 'up', meilisearch: 'up' },
      });
  });

  it('returns 503 with safe dependency status when a dependency is down', async () => {
    readinessService.check.mockResolvedValue({
      postgres: 'up',
      meilisearch: 'down',
    });

    await request(app.getHttpServer())
      .get('/meta/ready')
      .expect(503, {
        status: 'unavailable',
        checks: { postgres: 'up', meilisearch: 'down' },
      });
  });

  it('returns 503 without dependency probes while the process drains', async () => {
    readinessService.isAcceptingTraffic.mockReturnValue(false);

    await request(app.getHttpServer()).get('/meta/ready').expect(503, {
      status: 'unavailable',
      reason: 'shutting_down',
    });
    expect(readinessService.check).not.toHaveBeenCalled();
  });
});

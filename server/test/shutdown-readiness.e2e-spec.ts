import {
  BeforeApplicationShutdown,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { MetaController } from '../src/controllers/meta.controller';
import { AppDataSource } from '../src/database';
import * as meilisearch from '../src/meilisearch';
import { meilisearchClient } from '../src/meilisearch';
import { ReadinessService } from '../src/services/readiness';

@Injectable()
class BlockingShutdown implements BeforeApplicationShutdown {
  private resolveStarted!: () => void;
  private resolveRelease!: () => void;
  readonly started = new Promise<void>((resolve) => {
    this.resolveStarted = resolve;
  });
  private readonly released = new Promise<void>((resolve) => {
    this.resolveRelease = resolve;
  });

  beforeApplicationShutdown(): Promise<void> {
    this.resolveStarted();
    return this.released;
  }

  release(): void {
    this.resolveRelease();
  }
}

describe('Shutdown readiness', () => {
  const originalDatabaseInitialized = AppDataSource.isInitialized;
  let app: INestApplication | undefined;
  let blocker: BlockingShutdown | undefined;
  let closePromise: Promise<void> | undefined;

  afterEach(async () => {
    blocker?.release();
    await closePromise;
    if (app && !closePromise) {
      await app.close();
    }
    jest.restoreAllMocks();
    (AppDataSource as { isInitialized: boolean }).isInitialized =
      originalDatabaseInitialized;
  });

  it('withdraws readiness before waiting for shutdown hooks', async () => {
    (AppDataSource as { isInitialized: boolean }).isInitialized = true;
    const databaseQuery = jest
      .spyOn(AppDataSource, 'query')
      .mockResolvedValue([]);
    const meilisearchHealth = jest
      .spyOn(meilisearchClient, 'health')
      .mockResolvedValue({ status: 'available' });
    jest
      .spyOn(meilisearch, 'isAnnotationIndexSchemaReady')
      .mockReturnValue(true);

    const moduleRef = await Test.createTestingModule({
      controllers: [MetaController],
      providers: [ReadinessService, BlockingShutdown],
    }).compile();
    app = moduleRef.createNestApplication();
    blocker = app.get(BlockingShutdown);
    await app.listen(0, '127.0.0.1');

    await request(app.getHttpServer())
      .get('/meta/ready')
      .expect(200, {
        status: 'ok',
        checks: { postgres: 'up', meilisearch: 'up' },
      });
    databaseQuery.mockClear();
    meilisearchHealth.mockClear();

    closePromise = app.close();
    await blocker.started;

    await request(app.getHttpServer()).get('/meta/ready').expect(503, {
      status: 'unavailable',
      reason: 'shutting_down',
    });
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(meilisearchHealth).not.toHaveBeenCalled();
  });
});

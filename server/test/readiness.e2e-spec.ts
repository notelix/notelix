import { AppDataSource } from '../src/database';
import * as meilisearch from '../src/meilisearch';
import { meilisearchClient } from '../src/meilisearch';
import { ReadinessService } from '../src/services/readiness';

describe('Dependency readiness', () => {
  const originalDatabaseInitialized = AppDataSource.isInitialized;

  beforeEach(() => {
    (AppDataSource as { isInitialized: boolean }).isInitialized = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (AppDataSource as { isInitialized: boolean }).isInitialized =
      originalDatabaseInitialized;
  });

  it('keeps readiness down until the Meilisearch schema is ready', async () => {
    jest.spyOn(AppDataSource, 'query').mockResolvedValue([]);
    jest
      .spyOn(meilisearchClient, 'health')
      .mockResolvedValue({ status: 'available' });
    jest
      .spyOn(meilisearch, 'isAnnotationIndexSchemaReady')
      .mockReturnValue(false);

    await expect(new ReadinessService().check()).resolves.toEqual({
      postgres: 'up',
      meilisearch: 'down',
    });
  });

  it('reports Meilisearch up only when health and schema checks pass', async () => {
    jest.spyOn(AppDataSource, 'query').mockResolvedValue([]);
    jest
      .spyOn(meilisearchClient, 'health')
      .mockResolvedValue({ status: 'available' });
    jest
      .spyOn(meilisearch, 'isAnnotationIndexSchemaReady')
      .mockReturnValue(true);

    await expect(new ReadinessService().check()).resolves.toEqual({
      postgres: 'up',
      meilisearch: 'up',
    });
  });
});

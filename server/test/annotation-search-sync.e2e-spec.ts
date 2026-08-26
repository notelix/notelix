import { Logger } from '@nestjs/common';
import { AppDataSource } from '../src/database';
import { meilisearchClient } from '../src/meilisearch';
import * as meilisearch from '../src/meilisearch';
import { AnnotationSearchSyncService } from '../src/services/annotationSearchSync';

describe('Annotation search synchronization', () => {
  const searchEnvironmentNames = [
    'RUN_MODE',
    'SEARCH_SYNC_BATCH_SIZE',
    'SEARCH_SYNC_INTERVAL_MS',
    'SEARCH_SYNC_LEASE_MS',
    'SEARCH_SYNC_RETRY_BASE_MS',
    'SEARCH_SYNC_RETRY_MAX_MS',
    'SEARCH_SYNC_SCHEMA_INTERVAL_MS',
  ] as const;
  const originalEnvironment = new Map(
    searchEnvironmentNames.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('coalesces new work and invalidates an older claim transactionally', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const service = new AnnotationSearchSyncService();

    await service.enqueue(12, manager as any);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("annotation_id") DO UPDATE'),
      [12],
    );
    const sql = manager.query.mock.calls[0][0];
    expect(sql).toContain('"revision" + 1');
    expect(sql).toContain(
      'WHEN "annotation_search_outbox"."claim_token" IS NULL',
    );
    expect(sql).toContain('THEN "annotation_search_outbox"."available_at"');
    expect(sql).toContain('"claim_token" = NULL');
    await expect(service.enqueue(0, manager as any)).rejects.toThrow(
      'search outbox annotation id must be a positive integer',
    );
  });

  it('indexes current plaintext rows and removes deleted or encrypted rows', async () => {
    jest
      .spyOn(meilisearch, 'ensureAnnotationIndexReady')
      .mockResolvedValue(undefined);
    const claimQuery = jest.fn().mockResolvedValue([
      { annotationId: 1, attemptCount: 1 },
      { annotationId: 2, attemptCount: 1 },
      { annotationId: 3, attemptCount: 1 },
    ]);
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation(async (callback: any) =>
        callback({ query: claimQuery }),
      );
    const databaseQuery = jest
      .spyOn(AppDataSource.manager, 'query')
      .mockResolvedValueOnce([
        {
          id: 1,
          uid: 'plaintext',
          url: 'https://example.com/plaintext',
          title: 'Plaintext',
          host: 'example.com',
          data: { text: 'searchable' },
          createdAt: new Date('2026-08-27T00:00:00.000Z'),
          updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          userId: 9,
          clientSideEncryption: '',
        },
        {
          id: 2,
          uid: 'encrypted',
          url: 'encrypted-url',
          title: 'encrypted-title',
          host: 'encrypted-host',
          data: { text: 'encrypted-text' },
          createdAt: new Date('2026-08-27T00:00:00.000Z'),
          updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          userId: 10,
          clientSideEncryption: 'encrypted-key-metadata',
        },
      ])
      .mockResolvedValueOnce([]);
    const index = jest
      .spyOn(meilisearchClient, 'IndexAnnotations')
      .mockResolvedValue(undefined);
    const unindex = jest
      .spyOn(meilisearchClient, 'UnIndexAnnotations')
      .mockResolvedValue(undefined);
    const service = new AnnotationSearchSyncService();

    await expect((service as any).drainOnce()).resolves.toBe(3);

    expect(index).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        uid: 'plaintext',
        user: expect.objectContaining({ id: 9 }),
      }),
    ]);
    expect(unindex).toHaveBeenCalledWith([2, 3]);
    expect(databaseQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE "annotation"."id" = ANY'),
      [[1, 2, 3]],
    );
    const claimToken = claimQuery.mock.calls[0][1][2];
    expect(claimToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(databaseQuery).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM "annotation_search_outbox" WHERE "claim_token" = $1',
      [claimToken],
    );
  });

  it('releases a failed claim with bounded exponential retry state', async () => {
    jest
      .spyOn(meilisearch, 'ensureAnnotationIndexReady')
      .mockResolvedValue(undefined);
    process.env.SEARCH_SYNC_RETRY_BASE_MS = '500';
    process.env.SEARCH_SYNC_RETRY_MAX_MS = '5000';
    const claimQuery = jest
      .fn()
      .mockResolvedValue([{ annotationId: 1, attemptCount: 4 }]);
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation(async (callback: any) =>
        callback({ query: claimQuery }),
      );
    const databaseQuery = jest
      .spyOn(AppDataSource.manager, 'query')
      .mockResolvedValueOnce([
        {
          id: 1,
          uid: 'plaintext',
          url: 'https://example.com',
          title: 'Plaintext',
          host: 'example.com',
          data: { text: 'searchable' },
          createdAt: new Date('2026-08-27T00:00:00.000Z'),
          updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          userId: 9,
          clientSideEncryption: '',
        },
      ])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(meilisearchClient, 'IndexAnnotations')
      .mockRejectedValue(new Error('search unavailable'));
    jest
      .spyOn(meilisearchClient, 'UnIndexAnnotations')
      .mockResolvedValue(undefined);
    const service = new AnnotationSearchSyncService();

    await expect((service as any).drainOnce()).rejects.toThrow(
      'search unavailable',
    );

    const claimToken = claimQuery.mock.calls[0][1][2];
    expect(databaseQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('power(2, LEAST("attempt_count" - 1, 10))'),
      [5000, 500, claimToken],
    );
    expect(databaseQuery.mock.calls[1][0]).toContain('"claim_token" = NULL');
  });

  it('repairs a missing idle index and requeues current annotations', async () => {
    const claimQuery = jest.fn().mockResolvedValue([]);
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation(async (callback: any) =>
        callback({ query: claimQuery }),
      );
    const databaseQuery = jest
      .spyOn(AppDataSource.manager, 'query')
      .mockResolvedValue([]);
    const ensureIndex = jest
      .spyOn(meilisearch, 'ensureAnnotationIndexReady')
      .mockImplementation(async (beforeSchemaRepair) => beforeSchemaRepair());
    const service = new AnnotationSearchSyncService();
    (service as any).nextSchemaCheckAt = 0;

    await expect((service as any).drainOnce()).resolves.toBe(0);

    expect(ensureIndex).toHaveBeenCalledTimes(1);
    expect(databaseQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT "id", 1, 0, now(), NULL, now()'),
    );
  });

  it('rejects unsafe worker limits at startup', () => {
    process.env.SEARCH_SYNC_BATCH_SIZE = '0';
    expect(() => new AnnotationSearchSyncService()).toThrow(
      'SEARCH_SYNC_BATCH_SIZE must be an integer between 1 and 500',
    );

    delete process.env.SEARCH_SYNC_BATCH_SIZE;
    process.env.SEARCH_SYNC_LEASE_MS = '999';
    expect(() => new AnnotationSearchSyncService()).toThrow(
      'SEARCH_SYNC_LEASE_MS must be an integer between 1000 and 600000',
    );
  });
});

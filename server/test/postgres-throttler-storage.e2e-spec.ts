import { Logger } from '@nestjs/common';
import { AppDataSource } from '../src/database';
import { PostgresThrottlerStorage } from '../src/services/postgresThrottlerStorage';

describe('Shared request rate limits', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('increments an atomic PostgreSQL budget and cleans expired rows in batches', async () => {
    const query = jest
      .spyOn(AppDataSource, 'query')
      .mockResolvedValueOnce([
        {
          totalHits: 7,
          timeToExpire: 42,
          isBlocked: false,
          timeToBlockExpire: 0,
        },
      ])
      .mockResolvedValueOnce([]);
    const storage = new PostgresThrottlerStorage();

    await expect(
      storage.increment('request-key', 60000, 10, 120000, 'default'),
    ).resolves.toEqual({
      totalHits: 7,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    expect(query.mock.calls[0][0]).toContain(
      'INSERT INTO "request_rate_limit"',
    );
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(query.mock.calls[0][0]).toContain('> $3');
    expect(query.mock.calls[0][0]).toContain(
      'COALESCE("blocked_until" > now(), false)',
    );
    expect(query.mock.calls[0][1]).toEqual(['request-key', 60000, 10, 120000]);
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[1][0]).toContain('LIMIT $1');
    expect(query.mock.calls[1][1]).toEqual([1000]);
  });

  it('keeps a bounded local rate limit during a PostgreSQL outage', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest
      .spyOn(AppDataSource, 'query')
      .mockRejectedValue(new Error('database unavailable'));
    const storage = new PostgresThrottlerStorage();

    const first = await storage.increment(
      'fallback-key',
      60000,
      1,
      60000,
      'default',
    );
    const second = await storage.increment(
      'fallback-key',
      60000,
      1,
      60000,
      'default',
    );

    expect(first).toEqual(
      expect.objectContaining({ totalHits: 1, isBlocked: false }),
    );
    expect(second).toEqual(
      expect.objectContaining({ totalHits: 2, isBlocked: true }),
    );
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    storage.onApplicationShutdown();
  });

  it('falls back when PostgreSQL returns a malformed record', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(AppDataSource, 'query').mockResolvedValue([{ totalHits: '1' }]);
    const storage = new PostgresThrottlerStorage();

    await expect(
      storage.increment('malformed-key', 60000, 10, 60000, 'default'),
    ).resolves.toEqual(
      expect.objectContaining({ totalHits: 1, isBlocked: false }),
    );
    storage.onApplicationShutdown();
  });
});

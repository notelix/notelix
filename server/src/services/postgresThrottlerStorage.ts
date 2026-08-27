import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppDataSource } from '../database';

const cleanupIntervalMs = 60 * 1000;
const cleanupBatchSize = 1000;
const warningIntervalMs = 30 * 1000;

interface RateLimitRow {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

export class PostgresThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(PostgresThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private nextCleanupAt = 0;
  private nextWarningAt = 0;

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RateLimitRow> {
    try {
      const rows: RateLimitRow[] = await AppDataSource.query(
        `
          INSERT INTO "request_rate_limit" AS "rate_limit"
            ("key", "hits", "expires_at", "blocked_until", "updated_at")
          VALUES (
            $1,
            1,
            now() + ($2 * interval '1 millisecond'),
            NULL,
            now()
          )
          ON CONFLICT ("key") DO UPDATE
          SET "hits" = CASE
                WHEN "rate_limit"."blocked_until" > now()
                  THEN "rate_limit"."hits"
                WHEN "rate_limit"."blocked_until" IS NOT NULL
                  OR "rate_limit"."expires_at" <= now()
                  THEN 1
                ELSE LEAST("rate_limit"."hits" + 1, 2147483647)
              END,
              "expires_at" = CASE
                WHEN "rate_limit"."blocked_until" > now()
                  THEN "rate_limit"."expires_at"
                WHEN "rate_limit"."blocked_until" IS NOT NULL
                  OR "rate_limit"."expires_at" <= now()
                  THEN now() + ($2 * interval '1 millisecond')
                ELSE "rate_limit"."expires_at"
              END,
              "blocked_until" = CASE
                WHEN "rate_limit"."blocked_until" > now()
                  THEN "rate_limit"."blocked_until"
                WHEN (
                  CASE
                    WHEN "rate_limit"."blocked_until" IS NOT NULL
                      OR "rate_limit"."expires_at" <= now()
                      THEN 1
                    ELSE LEAST("rate_limit"."hits" + 1, 2147483647)
                  END
                ) > $3
                  THEN now() + ($4 * interval '1 millisecond')
                ELSE NULL
              END,
              "updated_at" = now()
          RETURNING
            "hits"::int AS "totalHits",
            GREATEST(
              0,
              CEIL(EXTRACT(EPOCH FROM ("expires_at" - now())))
            )::int AS "timeToExpire",
            COALESCE("blocked_until" > now(), false) AS "isBlocked",
            CASE
              WHEN "blocked_until" > now() THEN GREATEST(
                0,
                CEIL(EXTRACT(EPOCH FROM ("blocked_until" - now())))
              )::int
              ELSE 0
            END AS "timeToBlockExpire"
        `,
        [key, ttl, limit, blockDuration],
      );
      const record = this.normalizeRecord(rows[0]);
      await this.cleanupExpiredRowsIfDue();
      return record;
    } catch (error) {
      this.warnAboutFallback(error);
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  onApplicationShutdown(): void {
    this.fallback.onApplicationShutdown();
  }

  private normalizeRecord(row: RateLimitRow | undefined): RateLimitRow {
    if (
      !row ||
      !Number.isSafeInteger(row.totalHits) ||
      row.totalHits < 0 ||
      !Number.isSafeInteger(row.timeToExpire) ||
      row.timeToExpire < 0 ||
      typeof row.isBlocked !== 'boolean' ||
      !Number.isSafeInteger(row.timeToBlockExpire) ||
      row.timeToBlockExpire < 0
    ) {
      throw new Error('rate-limit storage returned an invalid record');
    }
    return row;
  }

  private async cleanupExpiredRowsIfDue(): Promise<void> {
    const now = Date.now();
    if (now < this.nextCleanupAt) {
      return;
    }
    this.nextCleanupAt = now + cleanupIntervalMs;
    try {
      await AppDataSource.query(
        `
          WITH "expired" AS (
            SELECT "key"
            FROM "request_rate_limit"
            WHERE "expires_at" <= now()
              AND ("blocked_until" IS NULL OR "blocked_until" <= now())
            ORDER BY "expires_at" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $1
          )
          DELETE FROM "request_rate_limit" AS "rate_limit"
          USING "expired"
          WHERE "rate_limit"."key" = "expired"."key"
        `,
        [cleanupBatchSize],
      );
    } catch (error) {
      this.warn('Failed to clean expired shared rate limits', error);
    }
  }

  private warnAboutFallback(error: unknown): void {
    const now = Date.now();
    if (now < this.nextWarningAt) {
      return;
    }
    this.nextWarningAt = now + warningIntervalMs;
    this.warn(
      'Shared rate-limit storage is unavailable; using the bounded per-process fallback',
      error,
    );
  }

  private warn(message: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(`${message}: ${detail}`);
  }
}

import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../database';
import { ensureAnnotationIndexReady, meilisearchClient } from '../meilisearch';
import { Annotation } from '../models/annotation.entity';
import { User } from '../models/user.entity';
import { readBoundedIntegerEnvironment } from '../../runtime-config';

const defaultBatchSize = 100;
const defaultIntervalMs = 1000;
const defaultLeaseMs = 60000;
const defaultRetryBaseMs = 1000;
const defaultRetryMaxMs = 60000;
const defaultSchemaCheckIntervalMs = 30000;

interface ClaimedSearchWork {
  annotationId: number;
  attemptCount: number;
}

interface SearchAnnotationRow {
  id: number;
  uid: string;
  url: string;
  title: string;
  host: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  userId: number | null;
  clientSideEncryption: string | null;
}

export async function enqueueAllAnnotationSearchUpdates(
  manager: EntityManager,
): Promise<void> {
  await manager.query(`
    INSERT INTO "annotation_search_outbox"
      ("annotation_id", "revision", "attempt_count", "available_at",
       "claim_token", "updated_at")
    SELECT "id", 1, 0, now(), NULL, now()
    FROM "annotation"
    ON CONFLICT ("annotation_id") DO UPDATE
    SET "revision" = "annotation_search_outbox"."revision" + 1,
        "attempt_count" = 0,
        "available_at" = now(),
        "claim_token" = NULL,
        "updated_at" = now()
  `);
}

@Injectable()
export class AnnotationSearchSyncService
  implements OnModuleInit, BeforeApplicationShutdown
{
  private readonly logger = new Logger(AnnotationSearchSyncService.name);
  private readonly batchSize = readBoundedIntegerEnvironment(
    'SEARCH_SYNC_BATCH_SIZE',
    defaultBatchSize,
    1,
    500,
  );
  private readonly intervalMs = readBoundedIntegerEnvironment(
    'SEARCH_SYNC_INTERVAL_MS',
    defaultIntervalMs,
    100,
    300000,
  );
  private readonly leaseMs = readBoundedIntegerEnvironment(
    'SEARCH_SYNC_LEASE_MS',
    defaultLeaseMs,
    1000,
    600000,
  );
  private readonly retryBaseMs = readBoundedIntegerEnvironment(
    'SEARCH_SYNC_RETRY_BASE_MS',
    defaultRetryBaseMs,
    100,
    60000,
  );
  private readonly retryMaxMs = readBoundedIntegerEnvironment(
    'SEARCH_SYNC_RETRY_MAX_MS',
    defaultRetryMaxMs,
    this.retryBaseMs,
    3600000,
  );
  private readonly schemaCheckIntervalMs = readBoundedIntegerEnvironment(
    'SEARCH_SYNC_SCHEMA_INTERVAL_MS',
    defaultSchemaCheckIntervalMs,
    1000,
    3600000,
  );
  private nextSchemaCheckAt = Date.now() + this.schemaCheckIntervalMs;
  private stopping = false;
  private wakePending = false;
  private wakeResolver?: () => void;
  private loopPromise?: Promise<void>;

  onModuleInit(): void {
    if (process.env.RUN_MODE !== 'AGENT') {
      this.logger.log('Starting durable annotation search synchronization');
      this.loopPromise = this.runLoop();
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.wake();
    await this.loopPromise;
  }

  async enqueue(annotationId: number, manager: EntityManager): Promise<void> {
    if (!Number.isSafeInteger(annotationId) || annotationId <= 0) {
      throw new Error('search outbox annotation id must be a positive integer');
    }
    await manager.query(
      `
        INSERT INTO "annotation_search_outbox"
          ("annotation_id", "revision", "attempt_count", "available_at",
           "claim_token", "updated_at")
        VALUES ($1, 1, 0, now(), NULL, now())
        ON CONFLICT ("annotation_id") DO UPDATE
        SET "revision" = "annotation_search_outbox"."revision" + 1,
            "available_at" = CASE
              WHEN "annotation_search_outbox"."claim_token" IS NULL
                THEN "annotation_search_outbox"."available_at"
              ELSE now()
            END,
            "claim_token" = NULL,
            "updated_at" = now()
      `,
      [annotationId],
    );
  }

  wake(): void {
    this.wakePending = true;
    this.wakeResolver?.();
  }

  private async runLoop(): Promise<void> {
    while (!this.stopping) {
      let claimedCount = 0;
      try {
        claimedCount = await this.drainOnce();
      } catch (error) {
        const trace = error instanceof Error ? error.stack : String(error);
        this.logger.error(
          'Failed to synchronize annotation search index',
          trace,
        );
      }
      if (this.stopping) {
        return;
      }
      if (claimedCount >= this.batchSize) {
        continue;
      }
      await this.waitForWork();
    }
  }

  private async waitForWork(): Promise<void> {
    if (this.wakePending) {
      this.wakePending = false;
      return;
    }
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        if (this.wakeResolver === finish) {
          this.wakeResolver = undefined;
        }
        resolve();
      };
      const timeout = setTimeout(finish, this.intervalMs);
      this.wakeResolver = finish;
      if (this.wakePending || this.stopping) {
        finish();
      }
    });
    this.wakePending = false;
  }

  private async drainOnce(): Promise<number> {
    const claimToken = randomUUID();
    const claimed = await AppDataSource.transaction(async (manager) =>
      manager.query(
        `
          WITH "candidates" AS (
            SELECT "annotation_id"
            FROM "annotation_search_outbox"
            WHERE "available_at" <= now()
            ORDER BY "available_at" ASC, "annotation_id" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $1
          ),
          "claimed" AS (
            UPDATE "annotation_search_outbox" AS "outbox"
            SET "attempt_count" = LEAST(
                  "outbox"."attempt_count" + 1,
                  2147483647
                ),
                "available_at" = now() + ($2 * interval '1 millisecond'),
                "claim_token" = $3,
                "updated_at" = now()
            FROM "candidates"
            WHERE "outbox"."annotation_id" = "candidates"."annotation_id"
            RETURNING "outbox"."annotation_id", "outbox"."attempt_count"
          )
          SELECT "annotation_id" AS "annotationId",
                 "attempt_count" AS "attemptCount"
          FROM "claimed"
        `,
        [this.batchSize, this.leaseMs, claimToken],
      ),
    );
    if (claimed.length === 0) {
      await this.checkSearchSchemaIfDue();
      return 0;
    }

    try {
      await this.synchronizeClaim(claimToken, claimed);
    } catch (error) {
      await this.releaseFailedClaim(claimToken);
      throw error;
    }
    return claimed.length;
  }

  private async checkSearchSchemaIfDue(): Promise<void> {
    if (Date.now() < this.nextSchemaCheckAt) {
      return;
    }
    this.nextSchemaCheckAt = Date.now() + this.schemaCheckIntervalMs;
    await ensureAnnotationIndexReady(() =>
      enqueueAllAnnotationSearchUpdates(AppDataSource.manager),
    );
  }

  private async synchronizeClaim(
    claimToken: string,
    claimed: ClaimedSearchWork[],
  ): Promise<void> {
    await ensureAnnotationIndexReady(() =>
      enqueueAllAnnotationSearchUpdates(AppDataSource.manager),
    );
    const annotationIds = claimed.map((item) => item.annotationId);
    const rows: SearchAnnotationRow[] = await AppDataSource.manager.query(
      `
        SELECT "annotation"."id", "annotation"."uid",
               "annotation"."url", "annotation"."title",
               "annotation"."host", "annotation"."data",
               "annotation"."created_at" AS "createdAt",
               "annotation"."updated_at" AS "updatedAt",
               "annotation"."userId" AS "userId",
               "user"."client_side_encryption" AS "clientSideEncryption"
        FROM "annotation"
        LEFT JOIN "user" ON "user"."id" = "annotation"."userId"
        WHERE "annotation"."id" = ANY($1::integer[])
      `,
      [annotationIds],
    );
    const rowsById = new Map(rows.map((row) => [Number(row.id), row]));
    const annotationsToIndex: Annotation[] = [];
    const annotationIdsToDelete: number[] = [];

    for (const annotationId of annotationIds) {
      const row = rowsById.get(annotationId);
      const shouldIndex =
        row &&
        (process.env.RUN_MODE === 'AGENT' ||
          row.userId === 0 ||
          !row.clientSideEncryption);
      if (!row || !shouldIndex) {
        annotationIdsToDelete.push(annotationId);
        continue;
      }
      annotationsToIndex.push(
        Object.assign(new Annotation(), {
          id: Number(row.id),
          uid: row.uid,
          url: row.url,
          title: row.title,
          host: row.host,
          data: row.data,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          user:
            row.userId === null
              ? undefined
              : (Object.assign(new User(), { id: Number(row.userId) }) as User),
        }),
      );
    }

    await Promise.all([
      meilisearchClient.IndexAnnotations(annotationsToIndex),
      meilisearchClient.UnIndexAnnotations(annotationIdsToDelete),
    ]);
    await AppDataSource.manager.query(
      'DELETE FROM "annotation_search_outbox" WHERE "claim_token" = $1',
      [claimToken],
    );
    this.logger.debug(
      `Synchronized ${claimed.length} annotation search updates`,
    );
  }

  private async releaseFailedClaim(claimToken: string): Promise<void> {
    await AppDataSource.manager.query(
      `
        UPDATE "annotation_search_outbox"
        SET "available_at" = now() + (
              LEAST(
                $1::double precision,
                $2::double precision * power(2, LEAST("attempt_count" - 1, 10))
              ) * interval '1 millisecond'
            ),
            "claim_token" = NULL,
            "updated_at" = now()
        WHERE "claim_token" = $3
      `,
      [this.retryMaxMs, this.retryBaseMs, claimToken],
    );
  }
}

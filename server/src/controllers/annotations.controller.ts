import {
  BadRequestException,
  Body,
  Controller,
  GoneException,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { Annotation } from '../models/annotation.entity';
import { EntityManager, MoreThan } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AnnotationChangeHistory } from '../models/annotationChangeHistory.entity';
import AnnotationChangeHistoryService from '../services/annotationChangeHistory';
import { meilisearchClient } from '../meilisearch';
import { isRunModeAgent } from './agentSyncController';
import { AppDataSource } from '../database';
import {
  DeleteAnnotationDto,
  FindAnnotationsDto,
  ListDiffDto,
  ListSnapshotPageDto,
  QueryAnnotationsByUrlDto,
  SaveAnnotationDto,
  SearchAnnotationsDto,
} from '../dto/annotations.dto';
import { AnnotationSearchSyncService } from '../services/annotationSearchSync';

const annotationColumnSql = {
  id: 'id',
  uid: 'uid',
  url: 'url',
  title: 'title',
  host: 'host',
  userId: '"userId"',
};
const defaultAnnotationDiffPageSize = 250;
const defaultAnnotationSnapshotPageSize = 100;
const annotationSnapshotTtlSeconds = 15 * 60;

function getAnnotationColumnSql(column: string): string {
  const sql = annotationColumnSql[column];
  if (!sql) {
    throw new BadRequestException(`unsupported annotation field ${column}`);
  }
  return sql;
}

async function lockAnnotation(
  manager: EntityManager,
  userId: number,
  uid: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `notelix-annotation:${userId}:${uid}`,
  ]);
}

@Controller('annotations')
export class AnnotationsController {
  constructor(
    private authenticationService: AuthenticationService,
    private annotationChangeHistoryService: AnnotationChangeHistoryService,
    private annotationSearchSyncService: AnnotationSearchSyncService,
  ) {}

  @Post('/save')
  async Save(@Body() request: SaveAnnotationDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const uid = request.uid;

    await AppDataSource.transaction(async (manager) => {
      await lockAnnotation(manager, user.id, uid);
      const annotationRepository = manager.getRepository(Annotation);
      let annotation = await annotationRepository.findOne({
        where: { user: { id: user.id }, uid },
      });

      if (!annotation) {
        annotation = new Annotation();
      }
      annotation.user = user;
      annotation.data = request.data || {};
      annotation.uid = uid;
      annotation.url = request.url || '';
      annotation.title = request.title || '';
      annotation.host = request.host || '';
      delete annotation.data.uid;
      delete annotation.data.url;
      delete annotation.data.title;
      delete annotation.data.host;
      annotation = await annotationRepository.save(annotation);

      await this.annotationChangeHistoryService.createAnnotationChangeHistoryForSave(
        annotation,
        manager,
      );
      await this.annotationSearchSyncService.enqueue(annotation.id, manager);
    });

    this.annotationSearchSyncService.wake();
    return {};
  }

  @Post('/delete')
  async Delete(@Body() request: DeleteAnnotationDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    await AppDataSource.transaction(async (manager) => {
      await lockAnnotation(manager, user.id, request.uid);
      const annotationRepository = manager.getRepository(Annotation);
      const annotation = await annotationRepository.findOne({
        where: {
          user: { id: user.id },
          uid: request.uid,
        },
      });

      if (!annotation) {
        throw new NotFoundException();
      }

      const deletedAnnotation = {
        ...annotation,
        user,
        id: annotation.id,
      } as Annotation;
      await annotationRepository.remove(annotation);
      await this.annotationChangeHistoryService.createAnnotationChangeHistoryForDelete(
        deletedAnnotation,
        manager,
      );
      await this.annotationSearchSyncService.enqueue(
        deletedAnnotation.id,
        manager,
      );
    });

    this.annotationSearchSyncService.wake();
    return {};
  }

  @Post('/queryByUrl')
  async QueryByUrl(@Body() request: QueryAnnotationsByUrlDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const list = await Annotation.find({
      where: {
        user: { id: user.id },
        url: request.url,
      },
    });

    return { list: list.map(Annotation.Neat) };
  }

  @Post('/list')
  async List(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();

    return AppDataSource.transaction('REPEATABLE READ', async (manager) => {
      const list = await manager.getRepository(Annotation).find({
        where: { user: { id: user.id } },
      });
      const annotationChangeHistoryLatestId =
        await AnnotationChangeHistory.getLatestIdForUser(user, manager);

      return { list, annotationChangeHistoryLatestId };
    });
  }

  @Post('/listPage')
  async ListPage(@Body() request: ListSnapshotPageDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const hasSnapshotId = request.snapshotId !== undefined;
    const hasAfterId = request.afterId !== undefined;
    if (hasSnapshotId !== hasAfterId) {
      throw new BadRequestException(
        'snapshotId and afterId must either both be present or both be absent',
      );
    }
    const limit = request.limit ?? defaultAnnotationSnapshotPageSize;

    return AppDataSource.transaction(async (manager) => {
      await manager.query(
        'DELETE FROM "annotation_sync_snapshot" WHERE "expires_at" <= now()',
      );

      let snapshotId = request.snapshotId;
      if (!snapshotId) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`notelix-annotation-snapshot:${user.id}`],
        );
        const existing = await manager.query(
          `
            SELECT "id"
            FROM "annotation_sync_snapshot"
            WHERE "user_id" = $1 AND "expires_at" > now()
            ORDER BY "created_at" DESC
            LIMIT 1
          `,
          [user.id],
        );
        snapshotId = existing[0]?.id;

        if (!snapshotId) {
          snapshotId = randomUUID();
          await manager.query(
            `
              WITH "watermark" AS (
                SELECT COALESCE(MAX("id"), 0)::int AS "id"
                FROM "annotation_change_history"
                WHERE "userId" = $2
              ),
              "new_snapshot" AS (
                INSERT INTO "annotation_sync_snapshot"
                  ("id", "user_id", "watermark", "expires_at")
                SELECT $1, $2, "watermark"."id",
                  now() + ($3 * interval '1 second')
                FROM "watermark"
                RETURNING "id"
              )
              INSERT INTO "annotation_sync_snapshot_item"
                ("snapshot_id", "annotation_id", "uid", "url", "title",
                 "host", "data", "created_at", "updated_at")
              SELECT "new_snapshot"."id", "annotation"."id",
                "annotation"."uid", "annotation"."url",
                "annotation"."title", "annotation"."host",
                "annotation"."data", "annotation"."created_at",
                "annotation"."updated_at"
              FROM "annotation"
              CROSS JOIN "new_snapshot"
              WHERE "annotation"."userId" = $2
            `,
            [snapshotId, user.id, annotationSnapshotTtlSeconds],
          );
        }
      }

      await manager.query(
        `
          UPDATE "annotation_sync_snapshot"
          SET "expires_at" = now() + ($3 * interval '1 second')
          WHERE "id" = $1 AND "user_id" = $2 AND "expires_at" > now()
        `,
        [snapshotId, user.id, annotationSnapshotTtlSeconds],
      );
      const snapshots = await manager.query(
        `
          SELECT "id", "watermark"
          FROM "annotation_sync_snapshot"
          WHERE "id" = $1 AND "user_id" = $2 AND "expires_at" > now()
        `,
        [snapshotId, user.id],
      );
      if (snapshots.length === 0) {
        throw new GoneException('annotation snapshot is missing or expired');
      }

      const afterId = request.afterId ?? 0;
      const rows = await manager.query(
        `
          SELECT "annotation_id" AS "id", "uid", "url", "title", "host",
            "data", "created_at", "updated_at"
          FROM "annotation_sync_snapshot_item"
          WHERE "snapshot_id" = $1 AND "annotation_id" > $2
          ORDER BY "annotation_id" ASC
          LIMIT $3
        `,
        [snapshotId, afterId, limit + 1],
      );
      const hasMore = rows.length > limit;
      const list = hasMore ? rows.slice(0, limit) : rows;
      const nextAfterId = list.at(-1)?.id ?? afterId;

      return {
        list,
        annotationChangeHistoryLatestId: Number(snapshots[0].watermark),
        snapshotId,
        nextAfterId,
        hasMore,
      };
    });
  }

  @Post('/listDiff')
  async ListDiff(@Body() request: ListDiffDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const sinceId = request.sinceId;
    const limit = request.limit ?? defaultAnnotationDiffPageSize;

    return AppDataSource.transaction('REPEATABLE READ', async (manager) => {
      const historyRepository = manager.getRepository(AnnotationChangeHistory);
      if (sinceId !== 0) {
        const history = await historyRepository.findOne({
          where: { id: sinceId, user: { id: user.id } },
        });
        if (!history) {
          // The requested history may have been pruned; the agent must re-list.
          return { ok: false };
        }
      }

      const rows = await historyRepository.find({
        where: {
          id: MoreThan(sinceId),
          user: { id: user.id },
        },
        order: { id: 'ASC' },
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const diff = hasMore ? rows.slice(0, limit) : rows;

      return { ok: true, diff, hasMore };
    });
  }

  @Post('/search')
  async Search(@Body() request: SearchAnnotationsDto): Promise<any> {
    let userId = 0;
    if (!isRunModeAgent()) {
      const user = await this.authenticationService.getAuthenticatedUser();
      userId = user.id;
    }
    const q = request.q;
    if (!q || !q.trim()) {
      return { results: { hits: [] } };
    }

    try {
      return { results: await meilisearchClient.queryAnnotations(q, userId) };
    } catch (_error) {
      throw new ServiceUnavailableException('annotation search unavailable');
    }
  }

  @Post('/find')
  async Find(@Body() request: FindAnnotationsDto): Promise<any> {
    let userId = 0;
    if (!isRunModeAgent()) {
      const user = await this.authenticationService.getAuthenticatedUser();
      userId = user.id;
    }
    const requestedSelectors = request.selectors || {};
    if (
      typeof requestedSelectors !== 'object' ||
      Array.isArray(requestedSelectors)
    ) {
      throw new BadRequestException('selectors must be an object');
    }
    const selectors = { ...requestedSelectors };
    const groupBy = request.groupBy || '';
    selectors['userId'] = userId;

    const selectorsKeyAndValues = Object.entries(selectors);
    const whereSql = selectorsKeyAndValues
      .map(
        (entry, index) => `${getAnnotationColumnSql(entry[0])}=$${index + 1}`,
      )
      .join(' AND ');
    const values = selectorsKeyAndValues.map((entry) => entry[1]);

    if (groupBy) {
      const groupBySql = getAnnotationColumnSql(groupBy);
      const sqlQuery = `select count(1) as count, ${groupBySql} from annotation where ${whereSql} GROUP BY ${groupBySql}`;

      const list = await AppDataSource.manager.query(sqlQuery, values);

      return { list };
    } else {
      const sqlQuery = `select * from annotation where ${whereSql}`;

      const list = await AppDataSource.manager.query(sqlQuery, values);

      return { list };
    }
  }
}

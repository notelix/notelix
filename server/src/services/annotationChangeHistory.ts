import { Injectable } from '@nestjs/common';
import {
  AnnotationChangeHistory,
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../models/annotationChangeHistory.entity';
import { Annotation } from '../models/annotation.entity';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../database';
import { readBoundedIntegerEnvironment } from '../../runtime-config';

const maximumHistoryEntriesPerUser = readBoundedIntegerEnvironment(
  'ANNOTATION_HISTORY_MAX_ENTRIES_PER_USER',
  10000,
  1,
  1000000,
);
const maximumHistoryPayloadBytesPerUser = readBoundedIntegerEnvironment(
  'ANNOTATION_HISTORY_MAX_PAYLOAD_BYTES_PER_USER',
  64 * 1024 * 1024,
  1024 * 1024,
  16 * 1024 * 1024 * 1024,
);

@Injectable()
export default class AnnotationChangeHistoryService {
  private async saveAndPrune(
    history: AnnotationChangeHistory,
    manager?: EntityManager,
  ): Promise<AnnotationChangeHistory> {
    if (!manager) {
      return AppDataSource.transaction((transactionManager) =>
        this.saveAndPrune(history, transactionManager),
      );
    }

    const savedHistory = await manager.save(history);
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`notelix-annotation-history:${history.user.id}`],
    );
    await manager.query(
      `
        WITH "ranked_history" AS (
          SELECT "id",
            ROW_NUMBER() OVER (ORDER BY "id" DESC) AS "entry_rank",
            SUM(
              octet_length("data"::text) + octet_length("uid") + 128
            ) OVER (
              ORDER BY "id" DESC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS "retained_bytes"
          FROM "annotation_change_history"
          WHERE "userId" = $1
        )
        DELETE FROM "annotation_change_history" AS "history"
        USING "ranked_history"
        WHERE "history"."id" = "ranked_history"."id"
          AND "ranked_history"."entry_rank" > 1
          AND (
            "ranked_history"."entry_rank" > $2
            OR "ranked_history"."retained_bytes" > $3
          )
      `,
      [
        history.user.id,
        maximumHistoryEntriesPerUser,
        maximumHistoryPayloadBytesPerUser,
      ],
    );
    return savedHistory;
  }

  createAnnotationChangeHistoryForSave = async (
    annotation: Annotation,
    manager?: EntityManager,
  ) => {
    const history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = Annotation.SyncSnapshot(annotation);
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindSave;
    return this.saveAndPrune(history, manager);
  };

  createAnnotationChangeHistoryForDelete = async (
    annotation: Annotation,
    manager?: EntityManager,
  ) => {
    const history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = Annotation.SyncSnapshot(annotation);
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindDelete;
    return this.saveAndPrune(history, manager);
  };
}

import { MigrationInterface, QueryRunner } from 'typeorm';
import { repairUnpairedUnicodeSurrogates } from './1787925600000-ScrubAnnotationHistorySecrets';

interface LegacyAnnotationRow {
  id: number;
  dataText: string;
}

export class RepairLegacyAnnotationJson1788271200000
  implements MigrationInterface
{
  name = 'RepairLegacyAnnotationJson1788271200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const batchSize = 500;
    let lastId = 0;

    while (true) {
      const rows: LegacyAnnotationRow[] = await queryRunner.query(
        `
          SELECT "id", "data"::text AS "dataText"
          FROM "annotation"
          WHERE "id" > $1 AND strpos("data"::text, $2) > 0
          ORDER BY "id"
          LIMIT ${batchSize}
        `,
        [lastId, '\\u'],
      );
      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const repaired = repairUnpairedUnicodeSurrogates(row.dataText);
        if (repaired !== row.dataText) {
          await queryRunner.query(
            `
              UPDATE "annotation"
              SET "data" = $1::json
              WHERE "id" = $2
            `,
            [repaired, row.id],
          );
          await queryRunner.query(
            `
              INSERT INTO "annotation_search_outbox" ("annotation_id")
              VALUES ($1)
              ON CONFLICT ("annotation_id") DO UPDATE
              SET "revision" = "annotation_search_outbox"."revision" + 1,
                  "attempt_count" = 0,
                  "available_at" = now(),
                  "claim_token" = NULL,
                  "updated_at" = now()
            `,
            [row.id],
          );
        }
      }

      lastId = rows[rows.length - 1].id;
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'Replacing invalid Unicode escapes in annotations is intentionally irreversible',
    );
  }
}

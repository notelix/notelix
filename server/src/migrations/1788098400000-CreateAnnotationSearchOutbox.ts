import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnotationSearchOutbox1788098400000
  implements MigrationInterface
{
  name = 'CreateAnnotationSearchOutbox1788098400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // A tombstone must remain after its annotation row is deleted, so this
    // table intentionally has no foreign key to annotation.
    await queryRunner.query(`
      CREATE TABLE "annotation_search_outbox" (
        "annotation_id" integer NOT NULL,
        "revision" bigint NOT NULL DEFAULT 1,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "claim_token" varchar(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_annotation_search_outbox"
          PRIMARY KEY ("annotation_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_search_outbox_available"
      ON "annotation_search_outbox" ("available_at", "annotation_id")
    `);
    await queryRunner.query(`
      INSERT INTO "annotation_search_outbox" ("annotation_id")
      SELECT "id" FROM "annotation"
      ON CONFLICT ("annotation_id") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "annotation_search_outbox"');
  }
}

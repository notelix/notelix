import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnotationSyncSnapshots1788012000000
  implements MigrationInterface
{
  name = 'CreateAnnotationSyncSnapshots1788012000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "annotation_sync_snapshot" (
        "id" varchar(64) NOT NULL,
        "user_id" integer NOT NULL,
        "watermark" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_annotation_sync_snapshot" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sync_snapshot_user_expires"
      ON "annotation_sync_snapshot" ("user_id", "expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sync_snapshot_expires"
      ON "annotation_sync_snapshot" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE TABLE "annotation_sync_snapshot_item" (
        "snapshot_id" varchar(64) NOT NULL,
        "annotation_id" integer NOT NULL,
        "uid" varchar(64) NOT NULL,
        "url" varchar(32768) NOT NULL,
        "title" varchar(32768) NOT NULL,
        "host" varchar(32768) NOT NULL,
        "data" json NOT NULL,
        "created_at" TIMESTAMP NOT NULL,
        "updated_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_annotation_sync_snapshot_item"
          PRIMARY KEY ("snapshot_id", "annotation_id"),
        CONSTRAINT "FK_annotation_sync_snapshot_item_session"
          FOREIGN KEY ("snapshot_id")
          REFERENCES "annotation_sync_snapshot"("id")
          ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "annotation_sync_snapshot_item"');
    await queryRunner.query('DROP TABLE "annotation_sync_snapshot"');
  }
}

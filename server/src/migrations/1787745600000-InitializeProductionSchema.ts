import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitializeProductionSchema1787745600000
  implements MigrationInterface
{
  name = 'InitializeProductionSchema1787745600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" SERIAL NOT NULL,
        "name" varchar(255) NOT NULL,
        "password" varchar(255) NOT NULL,
        "client_side_encryption" varchar(4096) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "annotation" (
        "id" SERIAL NOT NULL,
        "uid" varchar(64) NOT NULL,
        "url" varchar(32768) NOT NULL,
        "title" varchar(32768) NOT NULL DEFAULT '',
        "host" varchar(32768) NOT NULL DEFAULT '',
        "data" json NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_ec39ebae82efb7cfc77302eb7b3" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "annotation_change_history" (
        "id" SERIAL NOT NULL,
        "kind" integer NOT NULL,
        "annotationId" integer NOT NULL,
        "uid" varchar(64) NOT NULL,
        "data" json NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_69496f0b87e1aa5f2df5843a1e8" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jwt_private_key" (
        "id" SERIAL NOT NULL,
        "privateKey" varchar(4096) NOT NULL,
        "publicKey" varchar(4096) NOT NULL,
        CONSTRAINT "PK_6a3cf0d93fc42a4e7b4ad12d1bb" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "static_token" (
        "id" SERIAL NOT NULL,
        "staticToken" varchar(64) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_faff0adaf9003203f5707419787" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_static_token_user" UNIQUE ("userId")
      )
    `);

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_065d4d8f3b5adb4a08841eae3c"',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_name" ON "user" ("name")',
    );
    await queryRunner.query(
      'ALTER TABLE "annotation" DROP CONSTRAINT IF EXISTS "UQ_cdb349fc80e4559e24315712043"',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_annotation_user_uid" ON "annotation" ("userId", "uid")',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_7fea5d496815dbc6eab30db64d"',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_annotation_user_url_host" ON "annotation" ("userId", "url", "host")',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_8d280e784d14b705f5c2c29b7c"',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_history_user" ON "annotation_change_history" ("userId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_static_token_token" ON "static_token" ("staticToken")',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname IN (
              'FK_history_user',
              'FK_8d280e784d14b705f5c2c29b7ce'
            )
            AND conrelid = 'annotation_change_history'::regclass
        ) THEN
          ALTER TABLE "annotation_change_history"
            ADD CONSTRAINT "FK_history_user"
            FOREIGN KEY ("userId") REFERENCES "user"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END
      $$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname IN (
              'FK_static_token_user',
              'FK_243bd4c4d314920c12ba30186bc'
            )
            AND conrelid = 'static_token'::regclass
        ) THEN
          ALTER TABLE "static_token"
            ADD CONSTRAINT "FK_static_token_user"
            FOREIGN KEY ("userId") REFERENCES "user"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END
      $$
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'The initial production schema migration is intentionally irreversible',
    );
  }
}

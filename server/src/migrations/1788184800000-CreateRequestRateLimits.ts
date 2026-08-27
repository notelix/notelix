import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRequestRateLimits1788184800000
  implements MigrationInterface
{
  name = 'CreateRequestRateLimits1788184800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "request_rate_limit" (
        "key" text NOT NULL,
        "hits" integer NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "blocked_until" TIMESTAMP WITH TIME ZONE,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_request_rate_limit" PRIMARY KEY ("key"),
        CONSTRAINT "CHK_request_rate_limit_hits" CHECK ("hits" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_request_rate_limit_expires"
      ON "request_rate_limit" ("expires_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "request_rate_limit"');
  }
}

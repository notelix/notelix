import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScrubAnnotationHistorySecrets1787925600000
  implements MigrationInterface
{
  name = 'ScrubAnnotationHistorySecrets1787925600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "annotation_change_history"
      SET "data" = ("data"::jsonb - 'user')::json
      WHERE "data"::jsonb ? 'user'
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Removing embedded user credentials from sync history is intentionally irreversible',
    );
  }
}

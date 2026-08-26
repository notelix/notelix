import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeAnnotationSync1787839200000 implements MigrationInterface {
  name = 'OptimizeAnnotationSync1787839200000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS "IDX_history_user_id"',
    );
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY "IDX_history_user_id"
      ON "annotation_change_history" ("userId", "id")
    `);
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS "IDX_history_user"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS "IDX_history_user"',
    );
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY "IDX_history_user"
      ON "annotation_change_history" ("userId")
    `);
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS "IDX_history_user_id"',
    );
  }
}

import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

interface LegacyStaticToken {
  id: number;
  staticToken: string;
  userId: number | null;
}

function digestStaticToken(staticToken: string): string {
  return createHash('sha256').update(staticToken, 'utf8').digest('hex');
}

export class ProtectAuthenticationSecrets1787752800000
  implements MigrationInterface
{
  name = 'ProtectAuthenticationSecrets1787752800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 0
    `);

    const tokens: LegacyStaticToken[] = await queryRunner.query(`
      SELECT "id", "staticToken", "userId"
      FROM "static_token"
      ORDER BY "id"
    `);

    for (const token of tokens) {
      const digest = digestStaticToken(token.staticToken);
      if (token.userId !== null) {
        await queryRunner.query(
          `
            UPDATE "user"
            SET "name" = $1
            WHERE "id" = $2 AND "name" = $3
          `,
          [
            `guest_${token.userId}_${digest.slice(0, 48)}`,
            token.userId,
            `guest_${token.staticToken}`,
          ],
        );
      }
      await queryRunner.query(
        `
          UPDATE "static_token"
          SET "staticToken" = $1, "updated_at" = now()
          WHERE "id" = $2
        `,
        [digest, token.id],
      );
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'Static-token hashing is intentionally irreversible and cannot be rolled back',
    );
  }
}

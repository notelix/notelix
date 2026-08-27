import { MigrationInterface, QueryRunner } from 'typeorm';

interface LegacyHistoryRow {
  id: number;
  dataText: string;
}

function escapedCodeUnitAt(value: string, index: number): number | null {
  if (value[index] !== '\\' || value[index + 1] !== 'u') {
    return null;
  }
  const hexadecimal = value.slice(index + 2, index + 6);
  if (!/^[a-f0-9]{4}$/i.test(hexadecimal)) {
    return null;
  }
  return Number.parseInt(hexadecimal, 16);
}

export function repairUnpairedUnicodeSurrogates(jsonText: string): string {
  let repaired = '';

  for (let index = 0; index < jsonText.length; ) {
    if (jsonText[index] !== '\\') {
      repaired += jsonText[index];
      index += 1;
      continue;
    }

    // A doubled backslash represents a literal backslash in JSON, not the
    // beginning of a Unicode escape.
    if (jsonText[index + 1] === '\\') {
      repaired += jsonText.slice(index, index + 2);
      index += 2;
      continue;
    }

    const codeUnit = escapedCodeUnitAt(jsonText, index);
    if (codeUnit === null) {
      repaired += jsonText[index];
      index += 1;
      continue;
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = escapedCodeUnitAt(jsonText, index + 6);
      if (
        nextCodeUnit !== null &&
        nextCodeUnit >= 0xdc00 &&
        nextCodeUnit <= 0xdfff
      ) {
        repaired += jsonText.slice(index, index + 12);
        index += 12;
      } else {
        repaired += '\\ufffd';
        index += 6;
      }
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      repaired += '\\ufffd';
      index += 6;
      continue;
    }

    repaired += jsonText.slice(index, index + 6);
    index += 6;
  }

  return repaired;
}

export class ScrubAnnotationHistorySecrets1787925600000
  implements MigrationInterface
{
  name = 'ScrubAnnotationHistorySecrets1787925600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const batchSize = 500;
    let lastId = 0;

    while (true) {
      const rows: LegacyHistoryRow[] = await queryRunner.query(
        `
          SELECT "id", "data"::text AS "dataText"
          FROM "annotation_change_history"
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
              UPDATE "annotation_change_history"
              SET "data" = $1::json
              WHERE "id" = $2
            `,
            [repaired, row.id],
          );
        }
      }

      lastId = rows[rows.length - 1].id;
    }

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

import { DataSource, EntityManager } from 'typeorm';

export const currentSchemaRevision = 'notelix-current-2026-08-30';

const currentSchemaTables = [
  'annotation',
  'annotation_change_history',
  'annotation_search_outbox',
  'annotation_sync_snapshot',
  'annotation_sync_snapshot_item',
  'jwt_private_key',
  'notelix_schema',
  'request_rate_limit',
  'static_token',
  'user',
];

const currentSchemaSql = `
  CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "name" varchar(255) NOT NULL,
    "password" varchar(255) NOT NULL,
    "client_side_encryption" varchar(4096) NOT NULL,
    "token_version" integer NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
  );

  CREATE UNIQUE INDEX "UQ_user_name" ON "user" ("name");

  CREATE TABLE "annotation" (
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
  );

  CREATE UNIQUE INDEX "UQ_annotation_user_uid"
    ON "annotation" ("userId", "uid");
  CREATE INDEX "IDX_annotation_user_url_host"
    ON "annotation" ("userId", "url", "host");

  CREATE TABLE "annotation_change_history" (
    "id" SERIAL NOT NULL,
    "kind" integer NOT NULL,
    "annotationId" integer NOT NULL,
    "uid" varchar(64) NOT NULL,
    "data" json NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    "userId" integer,
    CONSTRAINT "PK_69496f0b87e1aa5f2df5843a1e8" PRIMARY KEY ("id"),
    CONSTRAINT "FK_history_user" FOREIGN KEY ("userId")
      REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
  );

  CREATE INDEX "IDX_history_user_id"
    ON "annotation_change_history" ("userId", "id");

  CREATE TABLE "jwt_private_key" (
    "id" SERIAL NOT NULL,
    "privateKey" varchar(4096) NOT NULL,
    "publicKey" varchar(4096) NOT NULL,
    CONSTRAINT "PK_6a3cf0d93fc42a4e7b4ad12d1bb" PRIMARY KEY ("id")
  );

  CREATE TABLE "static_token" (
    "id" SERIAL NOT NULL,
    "staticToken" varchar(64) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    "userId" integer,
    CONSTRAINT "PK_faff0adaf9003203f5707419787" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_static_token_user" UNIQUE ("userId"),
    CONSTRAINT "FK_static_token_user" FOREIGN KEY ("userId")
      REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
  );

  CREATE UNIQUE INDEX "UQ_static_token_token"
    ON "static_token" ("staticToken");

  CREATE TABLE "annotation_sync_snapshot" (
    "id" varchar(64) NOT NULL,
    "user_id" integer NOT NULL,
    "watermark" integer NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "PK_annotation_sync_snapshot" PRIMARY KEY ("id")
  );

  CREATE INDEX "IDX_sync_snapshot_user_expires"
    ON "annotation_sync_snapshot" ("user_id", "expires_at");
  CREATE INDEX "IDX_sync_snapshot_expires"
    ON "annotation_sync_snapshot" ("expires_at");

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
      REFERENCES "annotation_sync_snapshot"("id") ON DELETE CASCADE
  );

  CREATE TABLE "annotation_search_outbox" (
    "annotation_id" integer NOT NULL,
    "revision" bigint NOT NULL DEFAULT 1,
    "attempt_count" integer NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "claim_token" varchar(64),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "PK_annotation_search_outbox" PRIMARY KEY ("annotation_id")
  );

  CREATE INDEX "IDX_search_outbox_available"
    ON "annotation_search_outbox" ("available_at", "annotation_id");

  CREATE TABLE "request_rate_limit" (
    "key" text NOT NULL,
    "hits" integer NOT NULL,
    "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "blocked_until" TIMESTAMP WITH TIME ZONE,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT "PK_request_rate_limit" PRIMARY KEY ("key"),
    CONSTRAINT "CHK_request_rate_limit_hits" CHECK ("hits" >= 0)
  );

  CREATE INDEX "IDX_request_rate_limit_expires"
    ON "request_rate_limit" ("expires_at");

  CREATE TABLE "notelix_schema" (
    "singleton" boolean NOT NULL DEFAULT true,
    "revision" varchar(64) NOT NULL,
    CONSTRAINT "PK_notelix_schema" PRIMARY KEY ("singleton"),
    CONSTRAINT "CHK_notelix_schema_singleton" CHECK ("singleton")
  );

  INSERT INTO "notelix_schema" ("revision")
  VALUES ('${currentSchemaRevision}');
`;

function assertCurrentTableSet(rows: Array<{ tablename: string }>): void {
  const actualTables = rows.map(({ tablename }) => tablename).sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(currentSchemaTables)) {
    throw new Error(
      'Database does not use the current Notelix schema; start with an empty database',
    );
  }
}

async function initializeOrValidateSchema(
  manager: EntityManager,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    'notelix-current-schema',
  ]);
  const tables: Array<{ tablename: string }> = await manager.query(`
    SELECT "tablename"
    FROM "pg_catalog"."pg_tables"
    WHERE "schemaname" = current_schema()
    ORDER BY "tablename"
  `);

  if (tables.length === 0) {
    await manager.query(currentSchemaSql);
    return;
  }

  assertCurrentTableSet(tables);
  const schemaRows: Array<{ revision: string }> = await manager.query(
    'SELECT "revision" FROM "notelix_schema" WHERE "singleton" = true',
  );
  if (
    schemaRows.length !== 1 ||
    schemaRows[0].revision !== currentSchemaRevision
  ) {
    throw new Error(
      'Database does not use the current Notelix schema; start with an empty database',
    );
  }
}

export async function ensureCurrentSchema(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(initializeOrValidateSchema);
}

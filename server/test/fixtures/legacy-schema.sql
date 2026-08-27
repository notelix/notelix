CREATE TABLE "user" (
  "id" SERIAL NOT NULL,
  "name" varchar(255) NOT NULL,
  "password" varchar(255) NOT NULL,
  "client_side_encryption" varchar(4096) NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_065d4d8f3b5adb4a08841eae3c" ON "user" ("name");

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
  CONSTRAINT "UQ_cdb349fc80e4559e24315712043" UNIQUE ("uid"),
  CONSTRAINT "PK_ec39ebae82efb7cfc77302eb7b3" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_7fea5d496815dbc6eab30db64d"
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
  CONSTRAINT "PK_69496f0b87e1aa5f2df5843a1e8" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_8d280e784d14b705f5c2c29b7c"
  ON "annotation_change_history" ("userId");

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
  CONSTRAINT "REL_243bd4c4d314920c12ba30186b" UNIQUE ("userId"),
  CONSTRAINT "PK_faff0adaf9003203f5707419787" PRIMARY KEY ("id")
);

ALTER TABLE "annotation_change_history"
  ADD CONSTRAINT "FK_8d280e784d14b705f5c2c29b7ce"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "static_token"
  ADD CONSTRAINT "FK_243bd4c4d314920c12ba30186bc"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO "user" ("name", "password", "client_side_encryption")
VALUES (
  'guest_llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllll',
  'legacy-hash',
  ''
);
INSERT INTO "annotation" ("uid", "url", "data", "userId")
VALUES (
  'legacy-uid',
  'https://example.com/legacy',
  '{"textAfter":"\udc61","emoji":"\ud83d\ude00","literal":"\\udc61"}',
  1
);
INSERT INTO "annotation_change_history"
  ("kind", "annotationId", "uid", "data", "userId")
VALUES (
  1,
  1,
  'legacy-uid',
  '{"id":1,"uid":"legacy-uid","textAfter":"\udc61","emoji":"\ud83d\ude00","literal":"\\udc61","user":{"id":1,"name":"legacy-user","password":"legacy-hash","client_side_encryption":"legacy-encryption-metadata"}}',
  1
);
INSERT INTO "static_token" ("staticToken", "userId")
VALUES ('llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllll', 1);

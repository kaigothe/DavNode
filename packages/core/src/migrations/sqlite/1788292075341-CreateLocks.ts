import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_locks` and `file_locks` tables (RFC 4918 §7–9
 * WebDAV locks), each with foreign keys to its parent resource and to
 * `principals`, and a unique index on `token` (global lookup for UNLOCK
 * and `If`-header validation).
 */
export class CreateLocks1788292075341 implements MigrationInterface {
  name = 'CreateLocks1788292075341';

  /** Applies the migration: creates the lock tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_52fa819b7afe6c73b9ac90ff8c7" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_b687c1bbac285cec3a98cf3efee" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_locks"("id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "collection_locks"`,
    );
    await queryRunner.query(`DROP TABLE "collection_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_locks" RENAME TO "collection_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_dd3be5955135ee49f14388907c1" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_f54427bf1772f846bdbeddc7e55" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_locks"("id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "file_locks"`,
    );
    await queryRunner.query(`DROP TABLE "file_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_locks" RENAME TO "file_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
  }

  /** Reverts the migration: drops the lock tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(
      `ALTER TABLE "file_locks" RENAME TO "temporary_file_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "file_locks"("id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_file_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(
      `ALTER TABLE "collection_locks" RENAME TO "temporary_collection_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_locks"("id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_collection_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(`DROP TABLE "file_locks"`);
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(`DROP TABLE "collection_locks"`);
  }
}

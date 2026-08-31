import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `file_resources` table (with its foreign keys to `tenants`,
 * `collections`, and `principals`, and its `(collection_id, name)`
 * unique index) and the `file_contents` table (with its unique,
 * cascading-on-delete foreign key to `file_resources`).
 */
export class CreateFileResources1788217588594 implements MigrationInterface {
  name = 'CreateFileResources1788217588594';

  /** Applies the migration: creates the `file_resources`/`file_contents` tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "file_contents" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "data" blob NOT NULL, CONSTRAINT "UQ_df2cad8fa50c3d3902d9aff0ccb" UNIQUE ("file_resource_id"), CONSTRAINT "REL_df2cad8fa50c3d3902d9aff0cc" UNIQUE ("file_resource_id"))`,
    );
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_8c9f2d57f09fbab834254cdb351" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_79f179ded1331d56c1d77f35cbd" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_088edeb6366943a9d94f8272d38" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_resources"("id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at" FROM "file_resources"`,
    );
    await queryRunner.query(`DROP TABLE "file_resources"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_resources" RENAME TO "file_resources"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_file_contents" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "data" blob NOT NULL, CONSTRAINT "UQ_df2cad8fa50c3d3902d9aff0ccb" UNIQUE ("file_resource_id"), CONSTRAINT "REL_df2cad8fa50c3d3902d9aff0cc" UNIQUE ("file_resource_id"), CONSTRAINT "FK_df2cad8fa50c3d3902d9aff0ccb" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_contents"("id", "file_resource_id", "data") SELECT "id", "file_resource_id", "data" FROM "file_contents"`,
    );
    await queryRunner.query(`DROP TABLE "file_contents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_contents" RENAME TO "file_contents"`,
    );
  }

  /** Reverts the migration: drops the `file_resources`/`file_contents` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "file_contents" RENAME TO "temporary_file_contents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_contents" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "data" blob NOT NULL, CONSTRAINT "UQ_df2cad8fa50c3d3902d9aff0ccb" UNIQUE ("file_resource_id"), CONSTRAINT "REL_df2cad8fa50c3d3902d9aff0cc" UNIQUE ("file_resource_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "file_contents"("id", "file_resource_id", "data") SELECT "id", "file_resource_id", "data" FROM "temporary_file_contents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_contents"`);
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(
      `ALTER TABLE "file_resources" RENAME TO "temporary_file_resources"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "file_resources"("id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at" FROM "temporary_file_resources"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_resources"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(`DROP TABLE "file_contents"`);
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(`DROP TABLE "file_resources"`);
  }
}

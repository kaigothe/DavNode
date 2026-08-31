import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collections` table, its foreign keys to `tenants`,
 * `principals`, and (self-referencing) `collections`, its
 * `(tenant_id, parent_collection_id)` index, and a partial unique index
 * on `(tenant_id)` (`WHERE parent_collection_id IS NULL`) enforcing at
 * most one root collection per tenant.
 */
export class CreateCollections1788216873371 implements MigrationInterface {
  name = 'CreateCollections1788216873371';

  /** Applies the migration: creates the `collections` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_540dccbd82902e2d164ca91ca6d" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_921059bf974517bd075d9c81061" FOREIGN KEY ("parent_collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_924c3e536070041d78a1ade1c03" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collections"("id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at" FROM "collections"`,
    );
    await queryRunner.query(`DROP TABLE "collections"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collections" RENAME TO "collections"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
  }

  /** Reverts the migration: drops the `collections` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(
      `ALTER TABLE "collections" RENAME TO "temporary_collections"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collections"("id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at" FROM "temporary_collections"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collections"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(`DROP TABLE "collections"`);
  }
}

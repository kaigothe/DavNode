import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `addressbooks` table, its foreign keys to `tenants` and
 * `principals`, and its `(tenant_id, owner_principal_id)` index. Unlike
 * `collections`, there is no unique index on `(tenant_id)` — a principal
 * may own more than one addressbook.
 */
export class CreateAddressbooks1788454861226 implements MigrationInterface {
  name = 'CreateAddressbooks1788454861226';

  /** Applies the migration: creates the `addressbooks` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_827be781a4d20fcdfbce2ab6dbc" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_a662f034e11bb9660ecde042be4" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbooks"("id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at" FROM "addressbooks"`,
    );
    await queryRunner.query(`DROP TABLE "addressbooks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbooks" RENAME TO "addressbooks"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
  }

  /** Reverts the migration: drops the `addressbooks` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(
      `ALTER TABLE "addressbooks" RENAME TO "temporary_addressbooks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbooks"("id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at" FROM "temporary_addressbooks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbooks"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(`DROP TABLE "addressbooks"`);
  }
}

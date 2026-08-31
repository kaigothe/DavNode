import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `users` table, its foreign keys to `principals` (unique)
 * and `tenants`, and its `(tenant_id, username)` unique index.
 */
export class CreateUsers1788211878093 implements MigrationInterface {
  name = 'CreateUsers1788211878093';

  /** Applies the migration: creates the `users` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "REL_77a9a771ebc3370f1af5273634" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "REL_77a9a771ebc3370f1af5273634" UNIQUE ("principal_id"), CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
  }

  /** Reverts the migration: drops the `users` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "REL_77a9a771ebc3370f1af5273634" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}

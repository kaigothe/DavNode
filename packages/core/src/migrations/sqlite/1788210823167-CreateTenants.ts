import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Creates the `tenants` table, including its unique index on `slug`. */
export class CreateTenants1788210823167 implements MigrationInterface {
  name = 'CreateTenants1788210823167';

  /** Applies the migration: creates the `tenants` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" varchar PRIMARY KEY NOT NULL, "slug" varchar NOT NULL, "name" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"))`,
    );
  }

  /** Reverts the migration: drops the `tenants` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}

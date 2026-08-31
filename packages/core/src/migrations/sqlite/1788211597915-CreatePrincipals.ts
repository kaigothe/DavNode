import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `principals` table, its foreign key to `tenants`, and its
 * `(tenant_id, kind)` index.
 */
export class CreatePrincipals1788211597915 implements MigrationInterface {
  name = 'CreatePrincipals1788211597915';

  /** Applies the migration: creates the `principals` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ), CONSTRAINT "FK_f0e7950772e6b6aca9c6f78a525" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_principals"("id", "tenant_id", "kind", "special_kind") SELECT "id", "tenant_id", "kind", "special_kind" FROM "principals"`,
    );
    await queryRunner.query(`DROP TABLE "principals"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_principals" RENAME TO "principals"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
  }

  /** Reverts the migration: drops the `principals` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(
      `ALTER TABLE "principals" RENAME TO "temporary_principals"`,
    );
    await queryRunner.query(
      `CREATE TABLE "principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ))`,
    );
    await queryRunner.query(
      `INSERT INTO "principals"("id", "tenant_id", "kind", "special_kind") SELECT "id", "tenant_id", "kind", "special_kind" FROM "temporary_principals"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_principals"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(`DROP TABLE "principals"`);
  }
}

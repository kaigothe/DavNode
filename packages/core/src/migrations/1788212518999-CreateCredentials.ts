import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `credentials` table, its foreign key to `users`, and its
 * `(user_id, type)` unique index.
 */
export class CreateCredentials1788212518999 implements MigrationInterface {
  name = 'CreateCredentials1788212518999';

  /** Applies the migration: creates the `credentials` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "credentials"`,
    );
    await queryRunner.query(`DROP TABLE "credentials"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_credentials" RENAME TO "credentials"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
  }

  /** Reverts the migration: drops the `credentials` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" RENAME TO "temporary_credentials"`,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "temporary_credentials"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_credentials"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(`DROP TABLE "credentials"`);
  }
}

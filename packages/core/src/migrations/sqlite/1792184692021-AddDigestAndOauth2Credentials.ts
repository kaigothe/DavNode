import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the Digest and OAuth2 columns to `credentials` (`digest_ha1`,
 * `digest_realm`, `oauth2_issuer`, `oauth2_subject`), widens the `type`
 * enum to `basic`/`digest`/`oauth2`, and adds a unique index on
 * `(oauth2_issuer, oauth2_subject)` so one external identity can be
 * linked to at most one user (M10,
 * milestones/M10-extended-auth/01-credential-entity-retrofit).
 */
export class AddDigestAndOauth2Credentials1792184692021 implements MigrationInterface {
  name = 'AddDigestAndOauth2Credentials1792184692021';

  /** Applies the migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "digest_ha1" varchar, "digest_realm" varchar, "oauth2_issuer" varchar, "oauth2_subject" varchar, CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic','digest','oauth2') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "digest_ha1" varchar, "digest_realm" varchar, "oauth2_issuer" varchar, "oauth2_subject" varchar, CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at", "digest_ha1", "digest_realm", "oauth2_issuer", "oauth2_subject") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at", "digest_ha1", "digest_realm", "oauth2_issuer", "oauth2_subject" FROM "credentials"`,
    );
    await queryRunner.query(`DROP TABLE "credentials"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_credentials" RENAME TO "credentials"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_38f5a20583df05b0211423af3c" ON "credentials" ("oauth2_issuer", "oauth2_subject") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
  }

  /** Reverts the migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(`DROP INDEX "IDX_38f5a20583df05b0211423af3c"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" RENAME TO "temporary_credentials"`,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "digest_ha1" varchar, "digest_realm" varchar, "oauth2_issuer" varchar, "oauth2_subject" varchar, CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at", "digest_ha1", "digest_realm", "oauth2_issuer", "oauth2_subject") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at", "digest_ha1", "digest_realm", "oauth2_issuer", "oauth2_subject" FROM "temporary_credentials"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_credentials"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" RENAME TO "temporary_credentials"`,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "temporary_credentials"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_credentials"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
  }
}

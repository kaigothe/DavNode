import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the Digest and OAuth2 columns to `credentials` (`digest_ha1`,
 * `digest_realm`, `oauth2_issuer`, `oauth2_subject`), widens the `type`
 * enum to `basic`/`digest`/`oauth2`, and adds a unique index on
 * `(oauth2_issuer, oauth2_subject)` so one external identity can be
 * linked to at most one user (M10,
 * milestones/M10-extended-auth/01-credential-entity-retrofit).
 */
export class AddDigestAndOauth2Credentials1792184692437 implements MigrationInterface {
  name = 'AddDigestAndOauth2Credentials1792184692437';

  /** Applies the migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD "digest_ha1" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD "digest_realm" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD "oauth2_issuer" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD "oauth2_subject" character varying`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_12644270511e5e10c22110d30a"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."credentials_type_enum" ADD VALUE 'digest'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."credentials_type_enum" ADD VALUE 'oauth2'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_38f5a20583df05b0211423af3c" ON "credentials"  ("oauth2_issuer", "oauth2_subject") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials"  ("user_id", "type") `,
    );
  }

  /** Reverts the migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_12644270511e5e10c22110d30a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_38f5a20583df05b0211423af3c"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."credentials_type_enum_old" AS ENUM('basic')`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ALTER COLUMN "type" TYPE "public"."credentials_type_enum_old" USING "type"::"text"::"public"."credentials_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."credentials_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."credentials_type_enum_old" RENAME TO "credentials_type_enum"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" USING btree ("type", "user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP COLUMN "oauth2_subject"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP COLUMN "oauth2_issuer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP COLUMN "digest_realm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP COLUMN "digest_ha1"`,
    );
  }
}

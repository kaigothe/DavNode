import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the Digest and OAuth2 columns to `credentials` (`digest_ha1`,
 * `digest_realm`, `oauth2_issuer`, `oauth2_subject`), widens the `type`
 * enum to `basic`/`digest`/`oauth2`, and adds a unique index on
 * `(oauth2_issuer, oauth2_subject)` so one external identity can be
 * linked to at most one user (M10,
 * milestones/M10-extended-auth/01-credential-entity-retrofit).
 */
export class AddDigestAndOauth2Credentials1792184693088 implements MigrationInterface {
  name = 'AddDigestAndOauth2Credentials1792184693088';

  /** Applies the migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD \`digest_ha1\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD \`digest_realm\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD \`oauth2_issuer\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD \`oauth2_subject\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` CHANGE \`type\` \`type\` enum ('basic', 'digest', 'oauth2') NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_38f5a20583df05b0211423af3c\` ON \`credentials\` (\`oauth2_issuer\`, \`oauth2_subject\`)`,
    );
  }

  /** Reverts the migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_38f5a20583df05b0211423af3c\` ON \`credentials\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` CHANGE \`type\` \`type\` enum ('basic') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP COLUMN \`oauth2_subject\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP COLUMN \`oauth2_issuer\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP COLUMN \`digest_realm\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP COLUMN \`digest_ha1\``,
    );
  }
}

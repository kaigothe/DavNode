import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `scheduling_inbox_items` (RFC 6638 §2.2 implicit scheduling,
 * M7): one row per delivered iTIP message, `method` restricted to
 * `REQUEST`/`REPLY`/`CANCEL`, an index on `uid` for reply-merge
 * correlation and one on `(tenant_id, owner_principal_id)` for listing a
 * user's own inbox. No unique constraint on `uid` — several items may
 * share one, an append-only log rather than a single current-state row
 * per event. Deliberately no ACE/lock/change-log table set: access is
 * always just "matches `owner_principal_id`", no RFC 3744 sharing.
 * `ics_data` is `longtext`, not `text`: MySQL's `text` holds at most
 * 64 KiB, too small for a `REQUEST` carrying a long description or an
 * inline `ATTACH`.
 */
export class CreateSchedulingInboxItems1790317046533 implements MigrationInterface {
  name = 'CreateSchedulingInboxItems1790317046533';

  /** Applies the migration: creates the `scheduling_inbox_items` table, its indexes and foreign keys. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`scheduling_inbox_items\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`ics_data\` longtext NOT NULL, \`method\` enum ('REQUEST', 'REPLY', 'CANCEL') NOT NULL, \`uid\` varchar(255) NOT NULL, \`etag\` varchar(255) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_80b1f8a06fdf44be017127d590\` (\`uid\`), INDEX \`IDX_590f46542b735f1f74c3ff798b\` (\`tenant_id\`, \`owner_principal_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` ADD CONSTRAINT \`FK_7f22de768bcfd46beca3612d35f\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` ADD CONSTRAINT \`FK_792cbbc25cb08b59cddc34e9a52\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops `scheduling_inbox_items`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` DROP FOREIGN KEY \`FK_792cbbc25cb08b59cddc34e9a52\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`scheduling_inbox_items\` DROP FOREIGN KEY \`FK_7f22de768bcfd46beca3612d35f\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_590f46542b735f1f74c3ff798b\` ON \`scheduling_inbox_items\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_80b1f8a06fdf44be017127d590\` ON \`scheduling_inbox_items\``,
    );
    await queryRunner.query(`DROP TABLE \`scheduling_inbox_items\``);
  }
}

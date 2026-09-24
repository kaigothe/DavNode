import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendars` table, its foreign keys to `tenants` and `principals`,
 * its `(tenant_id, owner_principal_id)` index and the unique index on
 * `ics_feed_token` (nullable — many calendars may have no feed token yet).
 * Unlike `collections`, there is no unique index on `(tenant_id)`: a principal
 * may own more than one calendar.
 */
export class CreateCalendars1790246704528 implements MigrationInterface {
  name = 'CreateCalendars1790246704528';

  /** Applies the migration: creates the `calendars` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`calendars\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`display_name\` varchar(255) NOT NULL, \`description\` text NULL, \`supported_component_set\` varchar(255) NOT NULL DEFAULT 'VEVENT', \`timezone\` text NULL, \`ics_feed_token\` varchar(255) NULL, \`sync_seq\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_849cdd27db4994598fccaef51a\` (\`ics_feed_token\`), INDEX \`IDX_5e0cde2775ff6908032a8fd7d4\` (\`tenant_id\`, \`owner_principal_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD CONSTRAINT \`FK_c6809561e0dc82e7ad5b8493e0f\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD CONSTRAINT \`FK_e7a60821a6568f5551eb19ddf31\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `calendars` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendars\` DROP FOREIGN KEY \`FK_e7a60821a6568f5551eb19ddf31\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendars\` DROP FOREIGN KEY \`FK_c6809561e0dc82e7ad5b8493e0f\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_5e0cde2775ff6908032a8fd7d4\` ON \`calendars\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_849cdd27db4994598fccaef51a\` ON \`calendars\``,
    );
    await queryRunner.query(`DROP TABLE \`calendars\``);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `calendars.name` — the calendar's own URL path segment — with a unique
 * index on `(tenant_id, owner_principal_id, name)`. `display_name` stays as the
 * human-readable name; before this, MKCALENDAR could not have honoured a
 * client's `displayname` next to its opaque (UUID) URL segment. The table
 * cannot hold rows yet — no code path creates calendars before the MKCALENDAR
 * handler this retrofit precedes — so the new NOT NULL column needs no
 * backfill.
 */
export class AddCalendarName1790257152836 implements MigrationInterface {
  name = 'AddCalendarName1790257152836';

  /** Applies the migration: adds `calendars.name` and its unique index. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendars\` ADD \`name\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_26c19a8c24733f34aad43fe3cd\` ON \`calendars\` (\`tenant_id\`, \`owner_principal_id\`, \`name\`)`,
    );
  }

  /** Reverts the migration: drops the unique index and `calendars.name`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_26c19a8c24733f34aad43fe3cd\` ON \`calendars\``,
    );
    await queryRunner.query(`ALTER TABLE \`calendars\` DROP COLUMN \`name\``);
  }
}

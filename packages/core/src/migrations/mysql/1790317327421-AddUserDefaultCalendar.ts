import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.default_calendar_id` (nullable FK → `calendars`,
 * planning/01-decisions.md Runde 22, M7): the calendar incoming
 * scheduling invites are auto-filed into. Set once, by MKCALENDAR, when
 * a user creates their first calendar — see `mkcalendar.route.ts`.
 */
export class AddUserDefaultCalendar1790317327421 implements MigrationInterface {
  name = 'AddUserDefaultCalendar1790317327421';

  /** Applies the migration: adds `users.default_calendar_id` and its foreign key. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`default_calendar_id\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_206a9c98c895e44a2e524b03edd\` FOREIGN KEY (\`default_calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops `users.default_calendar_id` and its foreign key. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_206a9c98c895e44a2e524b03edd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`default_calendar_id\``,
    );
  }
}

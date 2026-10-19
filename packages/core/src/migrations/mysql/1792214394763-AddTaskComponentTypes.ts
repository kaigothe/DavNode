import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `calendar_objects.component_type` to `VEVENT`/`VTODO`/`VJOURNAL`,
 * so calendars can hold tasks and journal entries. Reverting deletes the
 * objects that no longer fit the narrower enum.
 */
export class AddTaskComponentTypes1792214394763 implements MigrationInterface {
  name = 'AddTaskComponentTypes1792214394763';

  /** Applies the migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` CHANGE \`component_type\` \`component_type\` enum ('VEVENT', 'VTODO', 'VJOURNAL') NOT NULL`,
    );
  }

  /** Reverts the migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`calendar_objects\` WHERE \`component_type\` <> 'VEVENT'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` CHANGE \`component_type\` \`component_type\` enum ('VEVENT') NOT NULL`,
    );
  }
}

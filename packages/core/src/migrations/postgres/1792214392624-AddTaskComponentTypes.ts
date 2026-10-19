import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `calendar_objects.component_type` to `VEVENT`/`VTODO`/`VJOURNAL`,
 * so calendars can hold tasks and journal entries. Reverting deletes the
 * objects that no longer fit the narrower enum.
 */
export class AddTaskComponentTypes1792214392624 implements MigrationInterface {
  name = 'AddTaskComponentTypes1792214392624';

  /** Applies the migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."calendar_objects_component_type_enum" ADD VALUE 'VTODO'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."calendar_objects_component_type_enum" ADD VALUE 'VJOURNAL'`,
    );
  }

  /** Reverts the migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "calendar_objects" WHERE "component_type" <> 'VEVENT'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_objects_component_type_enum_old" AS ENUM('VEVENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" ALTER COLUMN "component_type" TYPE "public"."calendar_objects_component_type_enum_old" USING "component_type"::"text"::"public"."calendar_objects_component_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."calendar_objects_component_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."calendar_objects_component_type_enum_old" RENAME TO "calendar_objects_component_type_enum"`,
    );
  }
}

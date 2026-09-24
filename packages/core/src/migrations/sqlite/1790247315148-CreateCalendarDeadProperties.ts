import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendar_properties` and `calendar_object_properties` tables
 * (dead properties, RFC 4918) with foreign keys to `calendars` and
 * `calendar_objects` and a unique index on `(<resource>_id, namespace, name)`
 * in each, so setting a property again overwrites instead of duplicating.
 */
export class CreateCalendarDeadProperties1790247315148 implements MigrationInterface {
  name = 'CreateCalendarDeadProperties1790247315148';

  /** Applies the migration: creates the calendar dead-property tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendar_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f9b50cba39e0b74f94b14412e1" ON "calendar_object_properties" ("calendar_object_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_701d82fed3be7d043bd4b21881" ON "calendar_properties" ("calendar_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_f9b50cba39e0b74f94b14412e1"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_e73274b0de016a20a459f48f587" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_object_properties"("id", "calendar_object_id", "namespace", "name", "value") SELECT "id", "calendar_object_id", "namespace", "name", "value" FROM "calendar_object_properties"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_object_properties" RENAME TO "calendar_object_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f9b50cba39e0b74f94b14412e1" ON "calendar_object_properties" ("calendar_object_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_701d82fed3be7d043bd4b21881"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_58a88e8e32a2363da9fad400578" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_properties"("id", "calendar_id", "namespace", "name", "value") SELECT "id", "calendar_id", "namespace", "name", "value" FROM "calendar_properties"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_properties" RENAME TO "calendar_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_701d82fed3be7d043bd4b21881" ON "calendar_properties" ("calendar_id", "namespace", "name") `,
    );
  }

  /** Reverts the migration: drops the calendar dead-property tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_701d82fed3be7d043bd4b21881"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_properties" RENAME TO "temporary_calendar_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_properties"("id", "calendar_id", "namespace", "name", "value") SELECT "id", "calendar_id", "namespace", "name", "value" FROM "temporary_calendar_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_701d82fed3be7d043bd4b21881" ON "calendar_properties" ("calendar_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_f9b50cba39e0b74f94b14412e1"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_object_properties" RENAME TO "temporary_calendar_object_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_object_properties"("id", "calendar_object_id", "namespace", "name", "value") SELECT "id", "calendar_object_id", "namespace", "name", "value" FROM "temporary_calendar_object_properties"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_calendar_object_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f9b50cba39e0b74f94b14412e1" ON "calendar_object_properties" ("calendar_object_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_701d82fed3be7d043bd4b21881"`);
    await queryRunner.query(`DROP TABLE "calendar_properties"`);
    await queryRunner.query(`DROP INDEX "IDX_f9b50cba39e0b74f94b14412e1"`);
    await queryRunner.query(`DROP TABLE "calendar_object_properties"`);
  }
}

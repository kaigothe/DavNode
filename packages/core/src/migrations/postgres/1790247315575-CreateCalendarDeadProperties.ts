import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendar_properties` and `calendar_object_properties` tables
 * (dead properties, RFC 4918) with foreign keys to `calendars` and
 * `calendar_objects` and a unique index on `(<resource>_id, namespace, name)`
 * in each, so setting a property again overwrites instead of duplicating.
 */
export class CreateCalendarDeadProperties1790247315575 implements MigrationInterface {
  name = 'CreateCalendarDeadProperties1790247315575';

  /** Applies the migration: creates the calendar dead-property tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendar_object_properties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_object_id" uuid NOT NULL, "namespace" character varying NOT NULL, "name" character varying NOT NULL, "value" text NOT NULL, CONSTRAINT "PK_45cf62e91859b36d6e71645daec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f9b50cba39e0b74f94b14412e1" ON "calendar_object_properties"  ("calendar_object_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_properties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_id" uuid NOT NULL, "namespace" character varying NOT NULL, "name" character varying NOT NULL, "value" text NOT NULL, CONSTRAINT "PK_73081a4e8d080ace9c8bfff9b22" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_701d82fed3be7d043bd4b21881" ON "calendar_properties"  ("calendar_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_properties" ADD CONSTRAINT "FK_e73274b0de016a20a459f48f587" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_properties" ADD CONSTRAINT "FK_58a88e8e32a2363da9fad400578" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the calendar dead-property tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calendar_properties" DROP CONSTRAINT "FK_58a88e8e32a2363da9fad400578"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_properties" DROP CONSTRAINT "FK_e73274b0de016a20a459f48f587"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_701d82fed3be7d043bd4b21881"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_properties"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f9b50cba39e0b74f94b14412e1"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_properties"`);
  }
}

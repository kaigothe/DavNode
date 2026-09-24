import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendar_objects` table and its `calendar_object_contents` table:
 * foreign keys to `tenants`, `calendars` and `principals`, unique indexes on
 * `(calendar_id, name)` (URL identity) and `(calendar_id, uid)` (RFC 4791
 * §5.3.2.1), the `(calendar_id, dtstart, recurrence_span_end)` index for the
 * time-range prefilter, and `ON DELETE CASCADE` from content to object. The
 * time-range columns are `bigint` epoch milliseconds (see
 * `epochMillisDateTransformer`); on MySQL `ics_data` is `longtext`.
 */
export class CreateCalendarObjects1790247080127 implements MigrationInterface {
  name = 'CreateCalendarObjects1790247080127';

  /** Applies the migration: creates `calendar_objects` and `calendar_object_contents`. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_objects_component_type_enum" AS ENUM('VEVENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_objects_transparency_enum" AS ENUM('opaque', 'transparent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_objects_status_enum" AS ENUM('tentative', 'confirmed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_objects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "calendar_id" uuid NOT NULL, "name" character varying NOT NULL, "uid" character varying NOT NULL, "etag" character varying NOT NULL, "component_type" "public"."calendar_objects_component_type_enum" NOT NULL, "owner_principal_id" uuid NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT false, "recurrence_span_end" bigint, "transparency" "public"."calendar_objects_transparency_enum" NOT NULL DEFAULT 'opaque', "status" "public"."calendar_objects_status_enum", "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_26f74b332455733acef60d01667" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects"  ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects"  ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects"  ("calendar_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_contents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_object_id" uuid NOT NULL, "ics_data" text NOT NULL, CONSTRAINT "UQ_73494e1d9b56babd9c6453de2f2" UNIQUE ("calendar_object_id"), CONSTRAINT "REL_73494e1d9b56babd9c6453de2f" UNIQUE ("calendar_object_id"), CONSTRAINT "PK_01a65a03bff52cd1624f9912878" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" ADD CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" ADD CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" ADD CONSTRAINT "FK_4227fe7c36e614604e245111372" FOREIGN KEY ("owner_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_contents" ADD CONSTRAINT "FK_73494e1d9b56babd9c6453de2f2" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops `calendar_object_contents` and `calendar_objects`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calendar_object_contents" DROP CONSTRAINT "FK_73494e1d9b56babd9c6453de2f2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" DROP CONSTRAINT "FK_4227fe7c36e614604e245111372"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" DROP CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" DROP CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_contents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_363f2351ac90d638ec8871cb6f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1bc73b35cc7ffcd525d356c685"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6529f5a58f6d5b5bdf732045d"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_objects"`);
    await queryRunner.query(
      `DROP TYPE "public"."calendar_objects_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."calendar_objects_transparency_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."calendar_objects_component_type_enum"`,
    );
  }
}

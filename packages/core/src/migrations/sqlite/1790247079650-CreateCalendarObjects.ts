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
export class CreateCalendarObjects1790247079650 implements MigrationInterface {
  name = 'CreateCalendarObjects1790247079650';

  /** Applies the migration: creates `calendar_objects` and `calendar_object_contents`. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_contents" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "ics_data" text NOT NULL, CONSTRAINT "UQ_73494e1d9b56babd9c6453de2f2" UNIQUE ("calendar_object_id"), CONSTRAINT "REL_73494e1d9b56babd9c6453de2f" UNIQUE ("calendar_object_id"))`,
    );
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_4227fe7c36e614604e245111372" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_objects"("id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at") SELECT "id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at" FROM "calendar_objects"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_objects" RENAME TO "calendar_objects"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_contents" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "ics_data" text NOT NULL, CONSTRAINT "UQ_73494e1d9b56babd9c6453de2f2" UNIQUE ("calendar_object_id"), CONSTRAINT "REL_73494e1d9b56babd9c6453de2f" UNIQUE ("calendar_object_id"), CONSTRAINT "FK_73494e1d9b56babd9c6453de2f2" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_object_contents"("id", "calendar_object_id", "ics_data") SELECT "id", "calendar_object_id", "ics_data" FROM "calendar_object_contents"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_contents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_object_contents" RENAME TO "calendar_object_contents"`,
    );
  }

  /** Reverts the migration: drops `calendar_object_contents` and `calendar_objects`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calendar_object_contents" RENAME TO "temporary_calendar_object_contents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_contents" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "ics_data" text NOT NULL, CONSTRAINT "UQ_73494e1d9b56babd9c6453de2f2" UNIQUE ("calendar_object_id"), CONSTRAINT "REL_73494e1d9b56babd9c6453de2f" UNIQUE ("calendar_object_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_object_contents"("id", "calendar_object_id", "ics_data") SELECT "id", "calendar_object_id", "ics_data" FROM "temporary_calendar_object_contents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_object_contents"`);
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" RENAME TO "temporary_calendar_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_objects"("id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at") SELECT "id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at" FROM "temporary_calendar_objects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_objects"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_contents"`);
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(`DROP TABLE "calendar_objects"`);
  }
}

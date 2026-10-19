import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `calendar_objects.component_type` to `VEVENT`/`VTODO`/`VJOURNAL`,
 * so calendars can hold tasks and journal entries. Reverting deletes the
 * objects that no longer fit the narrower enum.
 */
export class AddTaskComponentTypes1792214385322 implements MigrationInterface {
  name = 'AddTaskComponentTypes1792214385322';

  /** Applies the migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT','VTODO','VJOURNAL') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4227fe7c36e614604e245111372" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
  }

  /** Reverts the migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "calendar_objects" WHERE "component_type" <> 'VEVENT'`,
    );
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" RENAME TO "temporary_calendar_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4227fe7c36e614604e245111372" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
  }
}

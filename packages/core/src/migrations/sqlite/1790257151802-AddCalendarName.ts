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
export class AddCalendarName1790257151802 implements MigrationInterface {
  name = 'AddCalendarName1790257151802';

  /** Applies the migration: adds `calendars.name` and its unique index. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL, CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at" FROM "calendars"`,
    );
    await queryRunner.query(`DROP TABLE "calendars"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendars" RENAME TO "calendars"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26c19a8c24733f34aad43fe3cd" ON "calendars" ("tenant_id", "owner_principal_id", "name") `,
    );
  }

  /** Reverts the migration: drops the unique index and `calendars.name`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_26c19a8c24733f34aad43fe3cd"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(
      `ALTER TABLE "calendars" RENAME TO "temporary_calendars"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at" FROM "temporary_calendars"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendars"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
  }
}

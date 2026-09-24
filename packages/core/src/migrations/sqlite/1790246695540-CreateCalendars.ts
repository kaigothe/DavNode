import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendars` table, its foreign keys to `tenants` and `principals`,
 * its `(tenant_id, owner_principal_id)` index and the unique index on
 * `ics_feed_token` (nullable — many calendars may have no feed token yet).
 * Unlike `collections`, there is no unique index on `(tenant_id)`: a principal
 * may own more than one calendar.
 */
export class CreateCalendars1790246695540 implements MigrationInterface {
  name = 'CreateCalendars1790246695540';

  /** Applies the migration: creates the `calendars` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at" FROM "calendars"`,
    );
    await queryRunner.query(`DROP TABLE "calendars"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendars" RENAME TO "calendars"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
  }

  /** Reverts the migration: drops the `calendars` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(
      `ALTER TABLE "calendars" RENAME TO "temporary_calendars"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at" FROM "temporary_calendars"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendars"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP TABLE "calendars"`);
  }
}

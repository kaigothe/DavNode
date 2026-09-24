import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the calendar domain's ACE, lock and change-log tables: `calendar_aces` and
 * `calendar_object_aces` (RFC 3744, `(<resource>_id, position)` index),
 * `calendar_locks` and `calendar_object_locks` (RFC 4918, unique `token`), and
 * `calendar_changes` (sync-collection log, unique `(calendar_id, seq)`), each
 * with its foreign keys. The ACE `privilege` enum is the shared catalog plus
 * `read-free-busy` (RFC 4791 §6.1.1), which is why it is a calendar-only
 * value list rather than an extension of the other domains' enums.
 */
export class CreateCalendarAcesLocksChanges1790247515906 implements MigrationInterface {
  name = 'CreateCalendarAcesLocksChanges1790247515906';

  /** Applies the migration: creates the calendar ACE, lock and change tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendar_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_759400fe0dd091c1470185e431" ON "calendar_aces" ("calendar_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_changes" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0f26b594e2d9732bd75063f3ad" ON "calendar_changes" ("calendar_id", "seq") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a2dbab79355593f530c2aa13a6" ON "calendar_locks" ("token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c4da49fc705bcaf5d64ccc7be8" ON "calendar_object_aces" ("calendar_object_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_686a2b73bcd8d26d8182188259" ON "calendar_object_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_759400fe0dd091c1470185e431"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_28bda8f1c6b5f350cefc31434f1" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_152802f03431b37689985a25433" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_aces"("id", "calendar_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "calendar_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "calendar_aces"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_aces" RENAME TO "calendar_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_759400fe0dd091c1470185e431" ON "calendar_aces" ("calendar_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_0f26b594e2d9732bd75063f3ad"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_changes" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_77820bd3f3f8a2da07bf884aaf1" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_changes"("id", "calendar_id", "seq", "name", "action", "created_at") SELECT "id", "calendar_id", "seq", "name", "action", "created_at" FROM "calendar_changes"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_changes" RENAME TO "calendar_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0f26b594e2d9732bd75063f3ad" ON "calendar_changes" ("calendar_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_a2dbab79355593f530c2aa13a6"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_0ee2f3b99a467ff1547e4e51fd0" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_6e35df3bb6e04309c042888ece6" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_locks"("id", "calendar_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "calendar_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "calendar_locks"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_locks" RENAME TO "calendar_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a2dbab79355593f530c2aa13a6" ON "calendar_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c4da49fc705bcaf5d64ccc7be8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_916060d7b0bb5871250a1934b9d" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_67c6c7c97d8cbcd577410d7aef5" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_object_aces"("id", "calendar_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "calendar_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "calendar_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_object_aces" RENAME TO "calendar_object_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c4da49fc705bcaf5d64ccc7be8" ON "calendar_object_aces" ("calendar_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_686a2b73bcd8d26d8182188259"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_e1de505eba49231332daf503a14" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_bf9308d1ebf2c35711898715ca3" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_object_locks"("id", "calendar_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "calendar_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "calendar_object_locks"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_object_locks" RENAME TO "calendar_object_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_686a2b73bcd8d26d8182188259" ON "calendar_object_locks" ("token") `,
    );
  }

  /** Reverts the migration: drops the calendar ACE, lock and change tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_686a2b73bcd8d26d8182188259"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_object_locks" RENAME TO "temporary_calendar_object_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_object_locks"("id", "calendar_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "calendar_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_calendar_object_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_object_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_686a2b73bcd8d26d8182188259" ON "calendar_object_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c4da49fc705bcaf5d64ccc7be8"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_object_aces" RENAME TO "temporary_calendar_object_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_object_aces"("id", "calendar_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "calendar_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_calendar_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_object_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c4da49fc705bcaf5d64ccc7be8" ON "calendar_object_aces" ("calendar_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_a2dbab79355593f530c2aa13a6"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_locks" RENAME TO "temporary_calendar_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_locks"("id", "calendar_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "calendar_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_calendar_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a2dbab79355593f530c2aa13a6" ON "calendar_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_0f26b594e2d9732bd75063f3ad"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_changes" RENAME TO "temporary_calendar_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_changes" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_changes"("id", "calendar_id", "seq", "name", "action", "created_at") SELECT "id", "calendar_id", "seq", "name", "action", "created_at" FROM "temporary_calendar_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0f26b594e2d9732bd75063f3ad" ON "calendar_changes" ("calendar_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_759400fe0dd091c1470185e431"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_aces" RENAME TO "temporary_calendar_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_aces"("id", "calendar_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "calendar_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_calendar_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_759400fe0dd091c1470185e431" ON "calendar_aces" ("calendar_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_686a2b73bcd8d26d8182188259"`);
    await queryRunner.query(`DROP TABLE "calendar_object_locks"`);
    await queryRunner.query(`DROP INDEX "IDX_c4da49fc705bcaf5d64ccc7be8"`);
    await queryRunner.query(`DROP TABLE "calendar_object_aces"`);
    await queryRunner.query(`DROP INDEX "IDX_a2dbab79355593f530c2aa13a6"`);
    await queryRunner.query(`DROP TABLE "calendar_locks"`);
    await queryRunner.query(`DROP INDEX "IDX_0f26b594e2d9732bd75063f3ad"`);
    await queryRunner.query(`DROP TABLE "calendar_changes"`);
    await queryRunner.query(`DROP INDEX "IDX_759400fe0dd091c1470185e431"`);
    await queryRunner.query(`DROP TABLE "calendar_aces"`);
  }
}

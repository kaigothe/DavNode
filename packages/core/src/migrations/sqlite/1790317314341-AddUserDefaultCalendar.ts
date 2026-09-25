import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.default_calendar_id` (nullable FK → `calendars`,
 * planning/01-decisions.md Runde 22, M7): the calendar incoming
 * scheduling invites are auto-filed into. Set once, by MKCALENDAR, when
 * a user creates their first calendar — see `mkcalendar.route.ts`.
 */
export class AddUserDefaultCalendar1790317314341 implements MigrationInterface {
  name = 'AddUserDefaultCalendar1790317314341';

  /** Applies the migration: adds `users.default_calendar_id` and its foreign key. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_206a9c98c895e44a2e524b03edd" FOREIGN KEY ("default_calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
  }

  /** Reverts the migration: drops `users.default_calendar_id` and its foreign key. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
  }
}

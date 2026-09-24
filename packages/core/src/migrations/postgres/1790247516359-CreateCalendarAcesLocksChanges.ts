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
export class CreateCalendarAcesLocksChanges1790247516359 implements MigrationInterface {
  name = 'CreateCalendarAcesLocksChanges1790247516359';

  /** Applies the migration: creates the calendar ACE, lock and change tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_aces_privilege_enum" AS ENUM('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all', 'read-free-busy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_aces_grant_deny_enum" AS ENUM('grant', 'deny')`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_aces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "privilege" "public"."calendar_aces_privilege_enum" NOT NULL, "grant_deny" "public"."calendar_aces_grant_deny_enum" NOT NULL, "protected" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_22383757f80c93a06f3b5c767eb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_759400fe0dd091c1470185e431" ON "calendar_aces"  ("calendar_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_changes_action_enum" AS ENUM('added', 'modified', 'deleted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_changes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_id" uuid NOT NULL, "seq" integer NOT NULL, "name" character varying NOT NULL, "action" "public"."calendar_changes_action_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_69e2008eba224ad075619d0245f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0f26b594e2d9732bd75063f3ad" ON "calendar_changes"  ("calendar_id", "seq") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_locks_scope_enum" AS ENUM('exclusive', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_locks_depth_enum" AS ENUM('zero', 'infinity')`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "token" character varying NOT NULL, "scope" "public"."calendar_locks_scope_enum" NOT NULL, "depth" "public"."calendar_locks_depth_enum" NOT NULL, "timeout_seconds" integer, "expires_at" TIMESTAMP, "owner_info" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_509212baf499e8d4cfea3f4b43c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a2dbab79355593f530c2aa13a6" ON "calendar_locks"  ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_object_aces_privilege_enum" AS ENUM('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all', 'read-free-busy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_object_aces_grant_deny_enum" AS ENUM('grant', 'deny')`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_aces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_object_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "privilege" "public"."calendar_object_aces_privilege_enum" NOT NULL, "grant_deny" "public"."calendar_object_aces_grant_deny_enum" NOT NULL, "protected" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_485f3371475293b117f84837550" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c4da49fc705bcaf5d64ccc7be8" ON "calendar_object_aces"  ("calendar_object_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."calendar_object_locks_scope_enum" AS ENUM('exclusive', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "calendar_object_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "token" character varying NOT NULL, "scope" "public"."calendar_object_locks_scope_enum" NOT NULL, "timeout_seconds" integer, "expires_at" TIMESTAMP, "owner_info" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_85b47c373fb56785027ef23ba6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_686a2b73bcd8d26d8182188259" ON "calendar_object_locks"  ("token") `,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_aces" ADD CONSTRAINT "FK_28bda8f1c6b5f350cefc31434f1" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_aces" ADD CONSTRAINT "FK_152802f03431b37689985a25433" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_changes" ADD CONSTRAINT "FK_77820bd3f3f8a2da07bf884aaf1" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_locks" ADD CONSTRAINT "FK_0ee2f3b99a467ff1547e4e51fd0" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_locks" ADD CONSTRAINT "FK_6e35df3bb6e04309c042888ece6" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_aces" ADD CONSTRAINT "FK_916060d7b0bb5871250a1934b9d" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_aces" ADD CONSTRAINT "FK_67c6c7c97d8cbcd577410d7aef5" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_locks" ADD CONSTRAINT "FK_e1de505eba49231332daf503a14" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_locks" ADD CONSTRAINT "FK_bf9308d1ebf2c35711898715ca3" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the calendar ACE, lock and change tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calendar_object_locks" DROP CONSTRAINT "FK_bf9308d1ebf2c35711898715ca3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_locks" DROP CONSTRAINT "FK_e1de505eba49231332daf503a14"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_aces" DROP CONSTRAINT "FK_67c6c7c97d8cbcd577410d7aef5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_object_aces" DROP CONSTRAINT "FK_916060d7b0bb5871250a1934b9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_locks" DROP CONSTRAINT "FK_6e35df3bb6e04309c042888ece6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_locks" DROP CONSTRAINT "FK_0ee2f3b99a467ff1547e4e51fd0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_changes" DROP CONSTRAINT "FK_77820bd3f3f8a2da07bf884aaf1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_aces" DROP CONSTRAINT "FK_152802f03431b37689985a25433"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_aces" DROP CONSTRAINT "FK_28bda8f1c6b5f350cefc31434f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_686a2b73bcd8d26d8182188259"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_locks"`);
    await queryRunner.query(
      `DROP TYPE "public"."calendar_object_locks_scope_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c4da49fc705bcaf5d64ccc7be8"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_object_aces"`);
    await queryRunner.query(
      `DROP TYPE "public"."calendar_object_aces_grant_deny_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."calendar_object_aces_privilege_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a2dbab79355593f530c2aa13a6"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_locks"`);
    await queryRunner.query(`DROP TYPE "public"."calendar_locks_depth_enum"`);
    await queryRunner.query(`DROP TYPE "public"."calendar_locks_scope_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0f26b594e2d9732bd75063f3ad"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_changes"`);
    await queryRunner.query(
      `DROP TYPE "public"."calendar_changes_action_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_759400fe0dd091c1470185e431"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_aces"`);
    await queryRunner.query(
      `DROP TYPE "public"."calendar_aces_grant_deny_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."calendar_aces_privilege_enum"`,
    );
  }
}

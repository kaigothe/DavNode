import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `ON DELETE CASCADE` (or, for `users.default_calendar_id`,
 * `ON DELETE SET NULL`) to every foreign key that was missing it, so
 * that a single `DELETE FROM tenants WHERE id = :id` removes a tenant's
 * entire row graph — principals, users, groups, every resource domain
 * and its `*_aces`/`*_locks`/`*_changes`/`*_properties` tables,
 * scheduling inbox items, credentials, ... — without leaving orphaned
 * rows anywhere (M9,
 * milestones/M9-admin-api/03-tenant-management/02-tenant-deletion.md).
 * `users.default_calendar_id` is the one deliberate exception: it is a
 * convenience pointer to one of the user's own calendars, not an
 * ownership relationship, so the calendar being deleted must not delete
 * the user too.
 */
export class AddTenantCascadeDeletes1791295189420 implements MigrationInterface {
  name = 'AddTenantCascadeDeletes1791295189420';

  /** Applies the migration: rebuilds every affected table with its foreign keys' new `ON DELETE` behavior. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_principals"("id", "tenant_id", "kind", "special_kind") SELECT "id", "tenant_id", "kind", "special_kind" FROM "principals"`,
    );
    await queryRunner.query(`DROP TABLE "principals"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_principals" RENAME TO "principals"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collections"("id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at" FROM "collections"`,
    );
    await queryRunner.query(`DROP TABLE "collections"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collections" RENAME TO "collections"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(`DROP INDEX "IDX_3abf52a6631b5fc54e07d9b723"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_aces" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_aces"("id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "collection_aces"`,
    );
    await queryRunner.query(`DROP TABLE "collection_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_aces" RENAME TO "collection_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3abf52a6631b5fc54e07d9b723" ON "collection_aces" ("collection_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbooks"("id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at" FROM "addressbooks"`,
    );
    await queryRunner.query(`DROP TABLE "addressbooks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbooks" RENAME TO "addressbooks"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_dfaabb97b6de005a6aa87ddd70"`);
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name" FROM "address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "address_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_objects" RENAME TO "address_objects"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dfaabb97b6de005a6aa87ddd70" ON "address_objects" ("addressbook_id", "name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_cea5558e69223650915eaaaddb"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_aces"("id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "address_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_aces" RENAME TO "address_object_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cea5558e69223650915eaaaddb" ON "address_object_aces" ("address_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_locks"("id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "collection_locks"`,
    );
    await queryRunner.query(`DROP TABLE "collection_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_locks" RENAME TO "collection_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_254bcdf1b251c770800bd6df00"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_locks"("id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "address_object_locks"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_locks" RENAME TO "address_object_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_254bcdf1b251c770800bd6df00" ON "address_object_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b0642562f4741bb41ba32afb74"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_properties"("id", "address_object_id", "namespace", "name", "value") SELECT "id", "address_object_id", "namespace", "name", "value" FROM "address_object_properties"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_properties" RENAME TO "address_object_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b0642562f4741bb41ba32afb74" ON "address_object_properties" ("address_object_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_7b49272b392aee3f6aa8152244"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_aces" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_aces"("id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "addressbook_aces"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_aces" RENAME TO "addressbook_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b49272b392aee3f6aa8152244" ON "addressbook_aces" ("addressbook_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_changes"("id", "collection_id", "seq", "name", "action", "created_at") SELECT "id", "collection_id", "seq", "name", "action", "created_at" FROM "collection_changes"`,
    );
    await queryRunner.query(`DROP TABLE "collection_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_changes" RENAME TO "collection_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_changes"("id", "addressbook_id", "seq", "name", "action", "created_at") SELECT "id", "addressbook_id", "seq", "name", "action", "created_at" FROM "addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_changes" RENAME TO "addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_2aba142fc16c2de2453f0a2a87"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_locks" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_locks"("id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "addressbook_locks"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_locks" RENAME TO "addressbook_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2aba142fc16c2de2453f0a2a87" ON "addressbook_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_properties" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_properties"("id", "addressbook_id", "namespace", "name", "value") SELECT "id", "addressbook_id", "namespace", "name", "value" FROM "addressbook_properties"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_properties" RENAME TO "addressbook_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e" ON "addressbook_properties" ("addressbook_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_26c19a8c24733f34aad43fe3cd"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name" FROM "calendars"`,
    );
    await queryRunner.query(`DROP TABLE "calendars"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendars" RENAME TO "calendars"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26c19a8c24733f34aad43fe3cd" ON "calendars" ("tenant_id", "owner_principal_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_759400fe0dd091c1470185e431"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
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
      `CREATE TABLE "temporary_calendar_changes" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
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
      `CREATE TABLE "temporary_calendar_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
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
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_objects"("id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at") SELECT "id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at" FROM "calendar_objects"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_objects" RENAME TO "calendar_objects"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c4da49fc705bcaf5d64ccc7be8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
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
      `CREATE TABLE "temporary_calendar_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
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
    await queryRunner.query(`DROP INDEX "IDX_f9b50cba39e0b74f94b14412e1"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
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
      `CREATE TABLE "temporary_calendar_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
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
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_properties"("id", "collection_id", "namespace", "name", "value") SELECT "id", "collection_id", "namespace", "name", "value" FROM "collection_properties"`,
    );
    await queryRunner.query(`DROP TABLE "collection_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_properties" RENAME TO "collection_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "credentials"`,
    );
    await queryRunner.query(`DROP TABLE "credentials"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_credentials" RENAME TO "credentials"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_resources"("id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at" FROM "file_resources"`,
    );
    await queryRunner.query(`DROP TABLE "file_resources"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_resources" RENAME TO "file_resources"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c79662927b5ac586f3f8a3dd17"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_aces" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_aces"("id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "file_aces"`,
    );
    await queryRunner.query(`DROP TABLE "file_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_aces" RENAME TO "file_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c79662927b5ac586f3f8a3dd17" ON "file_aces" ("file_resource_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_locks"("id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "file_locks"`,
    );
    await queryRunner.query(`DROP TABLE "file_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_locks" RENAME TO "file_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_properties"("id", "file_resource_id", "namespace", "name", "value") SELECT "id", "file_resource_id", "namespace", "name", "value" FROM "file_properties"`,
    );
    await queryRunner.query(`DROP TABLE "file_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_properties" RENAME TO "file_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_groups"("id", "principal_id", "tenant_id", "name", "description") SELECT "id", "principal_id", "tenant_id", "name", "description" FROM "groups"`,
    );
    await queryRunner.query(`DROP TABLE "groups"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_groups" RENAME TO "groups"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_group_memberships"("id", "group_id", "member_principal_id") SELECT "id", "group_id", "member_principal_id" FROM "group_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "group_memberships"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_group_memberships" RENAME TO "group_memberships"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_scheduling_inbox_items"("id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at") SELECT "id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at" FROM "scheduling_inbox_items"`,
    );
    await queryRunner.query(`DROP TABLE "scheduling_inbox_items"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_scheduling_inbox_items" RENAME TO "scheduling_inbox_items"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ), CONSTRAINT "FK_f0e7950772e6b6aca9c6f78a525" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_principals"("id", "tenant_id", "kind", "special_kind") SELECT "id", "tenant_id", "kind", "special_kind" FROM "principals"`,
    );
    await queryRunner.query(`DROP TABLE "principals"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_principals" RENAME TO "principals"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_540dccbd82902e2d164ca91ca6d" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_921059bf974517bd075d9c81061" FOREIGN KEY ("parent_collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_924c3e536070041d78a1ade1c03" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collections"("id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at" FROM "collections"`,
    );
    await queryRunner.query(`DROP TABLE "collections"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collections" RENAME TO "collections"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(`DROP INDEX "IDX_3abf52a6631b5fc54e07d9b723"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_aces" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_af5769209aee6853ae7011138c1" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_b0777647b1b015e4305f5782b09" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_aces"("id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "collection_aces"`,
    );
    await queryRunner.query(`DROP TABLE "collection_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_aces" RENAME TO "collection_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3abf52a6631b5fc54e07d9b723" ON "collection_aces" ("collection_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_827be781a4d20fcdfbce2ab6dbc" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a662f034e11bb9660ecde042be4" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbooks"("id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at" FROM "addressbooks"`,
    );
    await queryRunner.query(`DROP TABLE "addressbooks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbooks" RENAME TO "addressbooks"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_dfaabb97b6de005a6aa87ddd70"`);
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL, CONSTRAINT "FK_941fdab999183be409b8482cc30" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name" FROM "address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "address_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_objects" RENAME TO "address_objects"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dfaabb97b6de005a6aa87ddd70" ON "address_objects" ("addressbook_id", "name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_cea5558e69223650915eaaaddb"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_58bf92e28b478c6534cf5b4bf0b" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_b8a7194ed4db62f4c1ec874d72a" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_aces"("id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "address_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_aces" RENAME TO "address_object_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cea5558e69223650915eaaaddb" ON "address_object_aces" ("address_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_52fa819b7afe6c73b9ac90ff8c7" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_b687c1bbac285cec3a98cf3efee" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_locks"("id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "collection_locks"`,
    );
    await queryRunner.query(`DROP TABLE "collection_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_locks" RENAME TO "collection_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_254bcdf1b251c770800bd6df00"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_caa2e72e6b5b67f465e5df6598f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e5a26600f217355768c3e161054" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_locks"("id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "address_object_locks"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_locks" RENAME TO "address_object_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_254bcdf1b251c770800bd6df00" ON "address_object_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b0642562f4741bb41ba32afb74"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_ebd34d3347a1b87beea377d7f4f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_properties"("id", "address_object_id", "namespace", "name", "value") SELECT "id", "address_object_id", "namespace", "name", "value" FROM "address_object_properties"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_properties" RENAME TO "address_object_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b0642562f4741bb41ba32afb74" ON "address_object_properties" ("address_object_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_7b49272b392aee3f6aa8152244"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_aces" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_163408d6e9b1ffcaeff70a7f66d" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_c0286abf23a6997225d554626ec" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_aces"("id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "addressbook_aces"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_aces" RENAME TO "addressbook_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b49272b392aee3f6aa8152244" ON "addressbook_aces" ("addressbook_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_3d0591021c856656a4f74355888" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_changes"("id", "collection_id", "seq", "name", "action", "created_at") SELECT "id", "collection_id", "seq", "name", "action", "created_at" FROM "collection_changes"`,
    );
    await queryRunner.query(`DROP TABLE "collection_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_changes" RENAME TO "collection_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_changes"("id", "addressbook_id", "seq", "name", "action", "created_at") SELECT "id", "addressbook_id", "seq", "name", "action", "created_at" FROM "addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_changes" RENAME TO "addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_2aba142fc16c2de2453f0a2a87"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_locks" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_a5a7e6ff45ec59e71ebd88fa4c1" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_5f3ebcdd331c93c69997e0670b1" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_locks"("id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "addressbook_locks"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_locks" RENAME TO "addressbook_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2aba142fc16c2de2453f0a2a87" ON "addressbook_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_properties" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_f56fbc9b44df33e0dae639055d2" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_properties"("id", "addressbook_id", "namespace", "name", "value") SELECT "id", "addressbook_id", "namespace", "name", "value" FROM "addressbook_properties"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_properties" RENAME TO "addressbook_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e" ON "addressbook_properties" ("addressbook_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_26c19a8c24733f34aad43fe3cd"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL, CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name" FROM "calendars"`,
    );
    await queryRunner.query(`DROP TABLE "calendars"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendars" RENAME TO "calendars"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26c19a8c24733f34aad43fe3cd" ON "calendars" ("tenant_id", "owner_principal_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_759400fe0dd091c1470185e431"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_28bda8f1c6b5f350cefc31434f1" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_152802f03431b37689985a25433" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "temporary_calendar_changes" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_77820bd3f3f8a2da07bf884aaf1" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "temporary_calendar_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_0ee2f3b99a467ff1547e4e51fd0" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6e35df3bb6e04309c042888ece6" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4227fe7c36e614604e245111372" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_calendar_objects"("id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at") SELECT "id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at" FROM "calendar_objects"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_calendar_objects" RENAME TO "calendar_objects"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c4da49fc705bcaf5d64ccc7be8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_916060d7b0bb5871250a1934b9d" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_67c6c7c97d8cbcd577410d7aef5" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "temporary_calendar_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_e1de505eba49231332daf503a14" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bf9308d1ebf2c35711898715ca3" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_f9b50cba39e0b74f94b14412e1"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_calendar_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_e73274b0de016a20a459f48f587" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "temporary_calendar_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_58a88e8e32a2363da9fad400578" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_10670fbbd7f617aab66b2fbb0ec" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_properties"("id", "collection_id", "namespace", "name", "value") SELECT "id", "collection_id", "namespace", "name", "value" FROM "collection_properties"`,
    );
    await queryRunner.query(`DROP TABLE "collection_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_properties" RENAME TO "collection_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_206a9c98c895e44a2e524b03edd" FOREIGN KEY ("default_calendar_id") REFERENCES "calendars" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "credentials"`,
    );
    await queryRunner.query(`DROP TABLE "credentials"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_credentials" RENAME TO "credentials"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_8c9f2d57f09fbab834254cdb351" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_79f179ded1331d56c1d77f35cbd" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_088edeb6366943a9d94f8272d38" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_resources"("id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at" FROM "file_resources"`,
    );
    await queryRunner.query(`DROP TABLE "file_resources"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_resources" RENAME TO "file_resources"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c79662927b5ac586f3f8a3dd17"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_aces" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_50c39db6813a50ea6a8df5bec97" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ebb79d587328df2209f597a5097" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_aces"("id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "file_aces"`,
    );
    await queryRunner.query(`DROP TABLE "file_aces"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_aces" RENAME TO "file_aces"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c79662927b5ac586f3f8a3dd17" ON "file_aces" ("file_resource_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_dd3be5955135ee49f14388907c1" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f54427bf1772f846bdbeddc7e55" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_locks"("id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "file_locks"`,
    );
    await queryRunner.query(`DROP TABLE "file_locks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_locks" RENAME TO "file_locks"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_2a9a1fa9b9b0fdd99af45f85381" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_properties"("id", "file_resource_id", "namespace", "name", "value") SELECT "id", "file_resource_id", "namespace", "name", "value" FROM "file_properties"`,
    );
    await queryRunner.query(`DROP TABLE "file_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_properties" RENAME TO "file_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"), CONSTRAINT "FK_49c3ac49d10e25bf2434234fcbe" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_245f58bdfb3e9529b4100d9c5e7" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_groups"("id", "principal_id", "tenant_id", "name", "description") SELECT "id", "principal_id", "tenant_id", "name", "description" FROM "groups"`,
    );
    await queryRunner.query(`DROP TABLE "groups"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_groups" RENAME TO "groups"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL, CONSTRAINT "FK_cad344fe877fcee0ac7e065ed05" FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_0e588f4e5fa5ddd066e35521540" FOREIGN KEY ("member_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_group_memberships"("id", "group_id", "member_principal_id") SELECT "id", "group_id", "member_principal_id" FROM "group_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "group_memberships"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_group_memberships" RENAME TO "group_memberships"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_7f22de768bcfd46beca3612d35f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_792cbbc25cb08b59cddc34e9a52" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_scheduling_inbox_items"("id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at") SELECT "id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at" FROM "scheduling_inbox_items"`,
    );
    await queryRunner.query(`DROP TABLE "scheduling_inbox_items"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_scheduling_inbox_items" RENAME TO "scheduling_inbox_items"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
  }

  /** Reverts the migration: rebuilds every affected table with its foreign keys back to `ON DELETE NO ACTION`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" RENAME TO "temporary_scheduling_inbox_items"`,
    );
    await queryRunner.query(
      `CREATE TABLE "scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "scheduling_inbox_items"("id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at") SELECT "id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at" FROM "temporary_scheduling_inbox_items"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_scheduling_inbox_items"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(
      `ALTER TABLE "group_memberships" RENAME TO "temporary_group_memberships"`,
    );
    await queryRunner.query(
      `CREATE TABLE "group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "group_memberships"("id", "group_id", "member_principal_id") SELECT "id", "group_id", "member_principal_id" FROM "temporary_group_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_group_memberships"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(
      `ALTER TABLE "groups" RENAME TO "temporary_groups"`,
    );
    await queryRunner.query(
      `CREATE TABLE "groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "groups"("id", "principal_id", "tenant_id", "name", "description") SELECT "id", "principal_id", "tenant_id", "name", "description" FROM "temporary_groups"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_groups"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(
      `ALTER TABLE "file_properties" RENAME TO "temporary_file_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "file_properties"("id", "file_resource_id", "namespace", "name", "value") SELECT "id", "file_resource_id", "namespace", "name", "value" FROM "temporary_file_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(
      `ALTER TABLE "file_locks" RENAME TO "temporary_file_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "file_locks"("id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_file_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c79662927b5ac586f3f8a3dd17"`);
    await queryRunner.query(
      `ALTER TABLE "file_aces" RENAME TO "temporary_file_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_aces" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "file_aces"("id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_file_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c79662927b5ac586f3f8a3dd17" ON "file_aces" ("file_resource_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(
      `ALTER TABLE "file_resources" RENAME TO "temporary_file_resources"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "file_resources"("id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at" FROM "temporary_file_resources"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_resources"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" RENAME TO "temporary_credentials"`,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "temporary_credentials"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_credentials"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(
      `ALTER TABLE "collection_properties" RENAME TO "temporary_collection_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_properties"("id", "collection_id", "namespace", "name", "value") SELECT "id", "collection_id", "namespace", "name", "value" FROM "temporary_collection_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
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
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
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
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
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
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP INDEX "IDX_26c19a8c24733f34aad43fe3cd"`);
    await queryRunner.query(
      `ALTER TABLE "calendars" RENAME TO "temporary_calendars"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name" FROM "temporary_calendars"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendars"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26c19a8c24733f34aad43fe3cd" ON "calendars" ("tenant_id", "owner_principal_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_properties" RENAME TO "temporary_addressbook_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_properties" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_properties"("id", "addressbook_id", "namespace", "name", "value") SELECT "id", "addressbook_id", "namespace", "name", "value" FROM "temporary_addressbook_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e" ON "addressbook_properties" ("addressbook_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_2aba142fc16c2de2453f0a2a87"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_locks" RENAME TO "temporary_addressbook_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_locks" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_locks"("id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_addressbook_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2aba142fc16c2de2453f0a2a87" ON "addressbook_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME TO "temporary_addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_changes"("id", "addressbook_id", "seq", "name", "action", "created_at") SELECT "id", "addressbook_id", "seq", "name", "action", "created_at" FROM "temporary_addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(
      `ALTER TABLE "collection_changes" RENAME TO "temporary_collection_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_changes"("id", "collection_id", "seq", "name", "action", "created_at") SELECT "id", "collection_id", "seq", "name", "action", "created_at" FROM "temporary_collection_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_7b49272b392aee3f6aa8152244"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_aces" RENAME TO "temporary_addressbook_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_aces" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_aces"("id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_addressbook_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_7b49272b392aee3f6aa8152244" ON "addressbook_aces" ("addressbook_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b0642562f4741bb41ba32afb74"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_properties" RENAME TO "temporary_address_object_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_properties"("id", "address_object_id", "namespace", "name", "value") SELECT "id", "address_object_id", "namespace", "name", "value" FROM "temporary_address_object_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b0642562f4741bb41ba32afb74" ON "address_object_properties" ("address_object_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_254bcdf1b251c770800bd6df00"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_locks" RENAME TO "temporary_address_object_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_locks"("id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_address_object_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_254bcdf1b251c770800bd6df00" ON "address_object_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(
      `ALTER TABLE "collection_locks" RENAME TO "temporary_collection_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_locks"("id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_collection_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_cea5558e69223650915eaaaddb"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_aces" RENAME TO "temporary_address_object_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_aces"("id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_address_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_cea5558e69223650915eaaaddb" ON "address_object_aces" ("address_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(`DROP INDEX "IDX_dfaabb97b6de005a6aa87ddd70"`);
    await queryRunner.query(
      `ALTER TABLE "address_objects" RENAME TO "temporary_address_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name" FROM "temporary_address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_objects"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dfaabb97b6de005a6aa87ddd70" ON "address_objects" ("addressbook_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(
      `ALTER TABLE "addressbooks" RENAME TO "temporary_addressbooks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbooks"("id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at" FROM "temporary_addressbooks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbooks"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_3abf52a6631b5fc54e07d9b723"`);
    await queryRunner.query(
      `ALTER TABLE "collection_aces" RENAME TO "temporary_collection_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_aces" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_aces"("id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_collection_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_3abf52a6631b5fc54e07d9b723" ON "collection_aces" ("collection_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(
      `ALTER TABLE "collections" RENAME TO "temporary_collections"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collections"("id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at" FROM "temporary_collections"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collections"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(
      `ALTER TABLE "principals" RENAME TO "temporary_principals"`,
    );
    await queryRunner.query(
      `CREATE TABLE "principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ))`,
    );
    await queryRunner.query(
      `INSERT INTO "principals"("id", "tenant_id", "kind", "special_kind") SELECT "id", "tenant_id", "kind", "special_kind" FROM "temporary_principals"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_principals"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" RENAME TO "temporary_scheduling_inbox_items"`,
    );
    await queryRunner.query(
      `CREATE TABLE "scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_792cbbc25cb08b59cddc34e9a52" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7f22de768bcfd46beca3612d35f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "scheduling_inbox_items"("id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at") SELECT "id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at" FROM "temporary_scheduling_inbox_items"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_scheduling_inbox_items"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(
      `ALTER TABLE "group_memberships" RENAME TO "temporary_group_memberships"`,
    );
    await queryRunner.query(
      `CREATE TABLE "group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL, CONSTRAINT "FK_0e588f4e5fa5ddd066e35521540" FOREIGN KEY ("member_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_cad344fe877fcee0ac7e065ed05" FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "group_memberships"("id", "group_id", "member_principal_id") SELECT "id", "group_id", "member_principal_id" FROM "temporary_group_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_group_memberships"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(
      `ALTER TABLE "groups" RENAME TO "temporary_groups"`,
    );
    await queryRunner.query(
      `CREATE TABLE "groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"), CONSTRAINT "FK_245f58bdfb3e9529b4100d9c5e7" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_49c3ac49d10e25bf2434234fcbe" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "groups"("id", "principal_id", "tenant_id", "name", "description") SELECT "id", "principal_id", "tenant_id", "name", "description" FROM "temporary_groups"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_groups"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(
      `ALTER TABLE "file_properties" RENAME TO "temporary_file_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_2a9a1fa9b9b0fdd99af45f85381" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "file_properties"("id", "file_resource_id", "namespace", "name", "value") SELECT "id", "file_resource_id", "namespace", "name", "value" FROM "temporary_file_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_8b6ffd73906276f27b80fc450e"`);
    await queryRunner.query(
      `ALTER TABLE "file_locks" RENAME TO "temporary_file_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_locks" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_f54427bf1772f846bdbeddc7e55" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_dd3be5955135ee49f14388907c1" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "file_locks"("id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "file_resource_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_file_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c79662927b5ac586f3f8a3dd17"`);
    await queryRunner.query(
      `ALTER TABLE "file_aces" RENAME TO "temporary_file_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_aces" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_ebb79d587328df2209f597a5097" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_50c39db6813a50ea6a8df5bec97" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "file_aces"("id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "file_resource_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_file_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c79662927b5ac586f3f8a3dd17" ON "file_aces" ("file_resource_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_90ecec466b9a944eac782cf60e"`);
    await queryRunner.query(
      `ALTER TABLE "file_resources" RENAME TO "temporary_file_resources"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_resources" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "collection_id" varchar NOT NULL, "name" varchar NOT NULL, "content_type" varchar NOT NULL, "etag" varchar NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_088edeb6366943a9d94f8272d38" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_79f179ded1331d56c1d77f35cbd" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8c9f2d57f09fbab834254cdb351" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "file_resources"("id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "collection_id", "name", "content_type", "etag", "size_bytes", "owner_principal_id", "created_at", "updated_at" FROM "temporary_file_resources"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_resources"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources" ("collection_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_12644270511e5e10c22110d30a"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" RENAME TO "temporary_credentials"`,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar CHECK( "type" IN ('basic') ) NOT NULL, "password_hash" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "credentials"("id", "user_id", "type", "password_hash", "created_at", "updated_at") SELECT "id", "user_id", "type", "password_hash", "created_at", "updated_at" FROM "temporary_credentials"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_credentials"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials" ("user_id", "type") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_52a29f8fc340e73d124af517f2"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "username" varchar NOT NULL, "email" varchar NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT (0), "role" varchar CHECK( "role" IN ('member','tenant_admin','server_admin') ) NOT NULL DEFAULT ('member'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "default_calendar_id" varchar, CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "FK_206a9c98c895e44a2e524b03edd" FOREIGN KEY ("default_calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id") SELECT "id", "principal_id", "tenant_id", "username", "email", "quota_limit_bytes", "quota_used_bytes", "role", "created_at", "default_calendar_id" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users" ("tenant_id", "username") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(
      `ALTER TABLE "collection_properties" RENAME TO "temporary_collection_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_10670fbbd7f617aab66b2fbb0ec" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_properties"("id", "collection_id", "namespace", "name", "value") SELECT "id", "collection_id", "namespace", "name", "value" FROM "temporary_collection_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_701d82fed3be7d043bd4b21881"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_properties" RENAME TO "temporary_calendar_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_58a88e8e32a2363da9fad400578" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "calendar_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_e73274b0de016a20a459f48f587" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_686a2b73bcd8d26d8182188259"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_object_locks" RENAME TO "temporary_calendar_object_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_bf9308d1ebf2c35711898715ca3" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_e1de505eba49231332daf503a14" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "calendar_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_67c6c7c97d8cbcd577410d7aef5" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_916060d7b0bb5871250a1934b9d" FOREIGN KEY ("calendar_object_id") REFERENCES "calendar_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_object_aces"("id", "calendar_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "calendar_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_calendar_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_object_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c4da49fc705bcaf5d64ccc7be8" ON "calendar_object_aces" ("calendar_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_f6529f5a58f6d5b5bdf732045d"`);
    await queryRunner.query(`DROP INDEX "IDX_1bc73b35cc7ffcd525d356c685"`);
    await queryRunner.query(`DROP INDEX "IDX_363f2351ac90d638ec8871cb6f"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_objects" RENAME TO "temporary_calendar_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "calendar_id" varchar NOT NULL, "name" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "component_type" varchar CHECK( "component_type" IN ('VEVENT') ) NOT NULL, "owner_principal_id" varchar NOT NULL, "dtstart" bigint NOT NULL, "dtend" bigint, "is_all_day" boolean NOT NULL DEFAULT (0), "recurrence_span_end" bigint, "transparency" varchar CHECK( "transparency" IN ('opaque','transparent') ) NOT NULL DEFAULT ('opaque'), "status" varchar CHECK( "status" IN ('tentative','confirmed','cancelled') ), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4227fe7c36e614604e245111372" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_89ff9f9b2f154fd9aa951719b52" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5799578b4cbd97d0777d0e3d8d5" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_objects"("id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at") SELECT "id", "tenant_id", "calendar_id", "name", "uid", "etag", "component_type", "owner_principal_id", "dtstart", "dtend", "is_all_day", "recurrence_span_end", "transparency", "status", "created_at", "updated_at" FROM "temporary_calendar_objects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_objects"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_f6529f5a58f6d5b5bdf732045d" ON "calendar_objects" ("calendar_id", "dtstart", "recurrence_span_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1bc73b35cc7ffcd525d356c685" ON "calendar_objects" ("calendar_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363f2351ac90d638ec8871cb6f" ON "calendar_objects" ("calendar_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_a2dbab79355593f530c2aa13a6"`);
    await queryRunner.query(
      `ALTER TABLE "calendar_locks" RENAME TO "temporary_calendar_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_locks" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_6e35df3bb6e04309c042888ece6" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0ee2f3b99a467ff1547e4e51fd0" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "calendar_changes" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_77820bd3f3f8a2da07bf884aaf1" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "calendar_aces" ("id" varchar PRIMARY KEY NOT NULL, "calendar_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all','read-free-busy') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_152802f03431b37689985a25433" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_28bda8f1c6b5f350cefc31434f1" FOREIGN KEY ("calendar_id") REFERENCES "calendars" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendar_aces"("id", "calendar_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "calendar_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_calendar_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendar_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_759400fe0dd091c1470185e431" ON "calendar_aces" ("calendar_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5e0cde2775ff6908032a8fd7d4"`);
    await queryRunner.query(`DROP INDEX "IDX_849cdd27db4994598fccaef51a"`);
    await queryRunner.query(`DROP INDEX "IDX_26c19a8c24733f34aad43fe3cd"`);
    await queryRunner.query(
      `ALTER TABLE "calendars" RENAME TO "temporary_calendars"`,
    );
    await queryRunner.query(
      `CREATE TABLE "calendars" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "supported_component_set" varchar NOT NULL DEFAULT ('VEVENT'), "timezone" text, "ics_feed_token" varchar, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL, CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "calendars"("id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "supported_component_set", "timezone", "ics_feed_token", "sync_seq", "created_at", "updated_at", "name" FROM "temporary_calendars"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_calendars"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars" ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26c19a8c24733f34aad43fe3cd" ON "calendars" ("tenant_id", "owner_principal_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_properties" RENAME TO "temporary_addressbook_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_properties" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_f56fbc9b44df33e0dae639055d2" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_properties"("id", "addressbook_id", "namespace", "name", "value") SELECT "id", "addressbook_id", "namespace", "name", "value" FROM "temporary_addressbook_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e" ON "addressbook_properties" ("addressbook_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_2aba142fc16c2de2453f0a2a87"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_locks" RENAME TO "temporary_addressbook_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_locks" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_5f3ebcdd331c93c69997e0670b1" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_a5a7e6ff45ec59e71ebd88fa4c1" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_locks"("id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "addressbook_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_addressbook_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2aba142fc16c2de2453f0a2a87" ON "addressbook_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME TO "temporary_addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_changes"("id", "addressbook_id", "seq", "name", "action", "created_at") SELECT "id", "addressbook_id", "seq", "name", "action", "created_at" FROM "temporary_addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(
      `ALTER TABLE "collection_changes" RENAME TO "temporary_collection_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_3d0591021c856656a4f74355888" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_changes"("id", "collection_id", "seq", "name", "action", "created_at") SELECT "id", "collection_id", "seq", "name", "action", "created_at" FROM "temporary_collection_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_7b49272b392aee3f6aa8152244"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_aces" RENAME TO "temporary_addressbook_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_aces" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c0286abf23a6997225d554626ec" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_163408d6e9b1ffcaeff70a7f66d" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_aces"("id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "addressbook_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_addressbook_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_7b49272b392aee3f6aa8152244" ON "addressbook_aces" ("addressbook_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b0642562f4741bb41ba32afb74"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_properties" RENAME TO "temporary_address_object_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_ebd34d3347a1b87beea377d7f4f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_properties"("id", "address_object_id", "namespace", "name", "value") SELECT "id", "address_object_id", "namespace", "name", "value" FROM "temporary_address_object_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b0642562f4741bb41ba32afb74" ON "address_object_properties" ("address_object_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_254bcdf1b251c770800bd6df00"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_locks" RENAME TO "temporary_address_object_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_e5a26600f217355768c3e161054" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_caa2e72e6b5b67f465e5df6598f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_locks"("id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "address_object_id", "principal_id", "token", "scope", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_address_object_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_254bcdf1b251c770800bd6df00" ON "address_object_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c"`);
    await queryRunner.query(
      `ALTER TABLE "collection_locks" RENAME TO "temporary_collection_locks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_locks" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b687c1bbac285cec3a98cf3efee" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_52fa819b7afe6c73b9ac90ff8c7" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_locks"("id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at") SELECT "id", "collection_id", "principal_id", "token", "scope", "depth", "timeout_seconds", "expires_at", "owner_info", "created_at" FROM "temporary_collection_locks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_locks"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks" ("token") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_cea5558e69223650915eaaaddb"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_aces" RENAME TO "temporary_address_object_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b8a7194ed4db62f4c1ec874d72a" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_58bf92e28b478c6534cf5b4bf0b" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_aces"("id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "address_object_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_address_object_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_cea5558e69223650915eaaaddb" ON "address_object_aces" ("address_object_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(`DROP INDEX "IDX_dfaabb97b6de005a6aa87ddd70"`);
    await queryRunner.query(
      `ALTER TABLE "address_objects" RENAME TO "temporary_address_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL, CONSTRAINT "FK_941fdab999183be409b8482cc30" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at", "name" FROM "temporary_address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_objects"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dfaabb97b6de005a6aa87ddd70" ON "address_objects" ("addressbook_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_15f92e8fb407a8f6716988c97a"`);
    await queryRunner.query(
      `ALTER TABLE "addressbooks" RENAME TO "temporary_addressbooks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbooks" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_a662f034e11bb9660ecde042be4" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_827be781a4d20fcdfbce2ab6dbc" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbooks"("id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "owner_principal_id", "display_name", "description", "sync_seq", "created_at", "updated_at" FROM "temporary_addressbooks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbooks"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_3abf52a6631b5fc54e07d9b723"`);
    await queryRunner.query(
      `ALTER TABLE "collection_aces" RENAME TO "temporary_collection_aces"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_aces" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b0777647b1b015e4305f5782b09" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_af5769209aee6853ae7011138c1" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_aces"("id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at") SELECT "id", "collection_id", "principal_id", "privilege", "grant_deny", "protected", "position", "created_at" FROM "temporary_collection_aces"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_aces"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_3abf52a6631b5fc54e07d9b723" ON "collection_aces" ("collection_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_a080534e206fe365544e2645cf"`);
    await queryRunner.query(`DROP INDEX "IDX_b1f9acafe3155bf27c4e903e46"`);
    await queryRunner.query(
      `ALTER TABLE "collections" RENAME TO "temporary_collections"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collections" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "parent_collection_id" varchar, "owner_principal_id" varchar NOT NULL, "display_name" varchar NOT NULL, "sync_seq" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_924c3e536070041d78a1ade1c03" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_921059bf974517bd075d9c81061" FOREIGN KEY ("parent_collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_540dccbd82902e2d164ca91ca6d" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collections"("id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at") SELECT "id", "tenant_id", "parent_collection_id", "owner_principal_id", "display_name", "sync_seq", "created_at", "updated_at" FROM "temporary_collections"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collections"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a080534e206fe365544e2645cf" ON "collections" ("tenant_id") WHERE parent_collection_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1f9acafe3155bf27c4e903e46" ON "collections" ("tenant_id", "parent_collection_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c2d13b5eb8cace20c9b2478375"`);
    await queryRunner.query(
      `ALTER TABLE "principals" RENAME TO "temporary_principals"`,
    );
    await queryRunner.query(
      `CREATE TABLE "principals" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "kind" varchar CHECK( "kind" IN ('user','group','special') ) NOT NULL, "special_kind" varchar CHECK( "special_kind" IN ('authenticated','unauthenticated','all','owner','self') ), CONSTRAINT "FK_f0e7950772e6b6aca9c6f78a525" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "principals"("id", "tenant_id", "kind", "special_kind") SELECT "id", "tenant_id", "kind", "special_kind" FROM "temporary_principals"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_principals"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals" ("tenant_id", "kind") `,
    );
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the addressbook domain's ACE, lock, and change-log tables:
 * `addressbook_aces`/`address_object_aces` (mirrors `CreateAces`, M3),
 * `addressbook_locks`/`address_object_locks` (mirrors `CreateLocks`,
 * M4), and `addressbook_changes` (mirrors `CreateCollectionChanges`,
 * M4). Index strategy matches those WebDAV originals 1:1: non-unique
 * `(<parent>_id, position)` on the ACE tables, a table-wide unique
 * `token` on the lock tables, and a unique `(addressbook_id, seq)` on
 * the change table. `addressbook_changes.address_object_id` has no
 * foreign key — see the `AddressbookChange` entity's doc comment for
 * why.
 */
export class CreateAddressbookAcesLocksChanges1788463385166
  implements MigrationInterface
{
  name = 'CreateAddressbookAcesLocksChanges1788463385166';

  /** Applies the migration: creates the addressbook ACE/lock/change tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "address_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cea5558e69223650915eaaaddb" ON "address_object_aces" ("address_object_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_254bcdf1b251c770800bd6df00" ON "address_object_locks" ("token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_aces" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b49272b392aee3f6aa8152244" ON "addressbook_aces" ("addressbook_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_locks" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2aba142fc16c2de2453f0a2a87" ON "addressbook_locks" ("token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "address_object_id" varchar, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_cea5558e69223650915eaaaddb"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_aces" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_58bf92e28b478c6534cf5b4bf0b" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_b8a7194ed4db62f4c1ec874d72a" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_254bcdf1b251c770800bd6df00"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_locks" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_caa2e72e6b5b67f465e5df6598f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_e5a26600f217355768c3e161054" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_7b49272b392aee3f6aa8152244"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_aces" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_163408d6e9b1ffcaeff70a7f66d" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_c0286abf23a6997225d554626ec" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_2aba142fc16c2de2453f0a2a87"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_locks" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "token" varchar NOT NULL, "scope" varchar CHECK( "scope" IN ('exclusive','shared') ) NOT NULL, "depth" varchar CHECK( "depth" IN ('zero','infinity') ) NOT NULL, "timeout_seconds" integer, "expires_at" datetime, "owner_info" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_a5a7e6ff45ec59e71ebd88fa4c1" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5f3ebcdd331c93c69997e0670b1" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "address_object_id" varchar, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_changes"("id", "addressbook_id", "seq", "address_object_id", "action", "created_at") SELECT "id", "addressbook_id", "seq", "address_object_id", "action", "created_at" FROM "addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_changes" RENAME TO "addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
  }

  /** Reverts the migration: drops the addressbook ACE/lock/change tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME TO "temporary_addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "address_object_id" varchar, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_changes"("id", "addressbook_id", "seq", "address_object_id", "action", "created_at") SELECT "id", "addressbook_id", "seq", "address_object_id", "action", "created_at" FROM "temporary_addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
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
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(`DROP TABLE "addressbook_changes"`);
    await queryRunner.query(`DROP INDEX "IDX_2aba142fc16c2de2453f0a2a87"`);
    await queryRunner.query(`DROP TABLE "addressbook_locks"`);
    await queryRunner.query(`DROP INDEX "IDX_7b49272b392aee3f6aa8152244"`);
    await queryRunner.query(`DROP TABLE "addressbook_aces"`);
    await queryRunner.query(`DROP INDEX "IDX_254bcdf1b251c770800bd6df00"`);
    await queryRunner.query(`DROP TABLE "address_object_locks"`);
    await queryRunner.query(`DROP INDEX "IDX_cea5558e69223650915eaaaddb"`);
    await queryRunner.query(`DROP TABLE "address_object_aces"`);
  }
}

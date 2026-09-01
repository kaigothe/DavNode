import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_aces` and `file_aces` tables (RFC 3744 access
 * control entries), each with foreign keys to its parent resource and to
 * `principals`, and a `(<parent>_id, position)` index for the
 * evaluation-order query the ACL evaluation engine relies on.
 */
export class CreateAces1788279306695 implements MigrationInterface {
  name = 'CreateAces1788279306695';

  /** Applies the migration: creates the ACE tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "collection_aces" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3abf52a6631b5fc54e07d9b723" ON "collection_aces" ("collection_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "file_aces" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c79662927b5ac586f3f8a3dd17" ON "file_aces" ("file_resource_id", "position") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_3abf52a6631b5fc54e07d9b723"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_aces" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_af5769209aee6853ae7011138c1" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_b0777647b1b015e4305f5782b09" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_c79662927b5ac586f3f8a3dd17"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_aces" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "principal_id" varchar NOT NULL, "privilege" varchar CHECK( "privilege" IN ('read','write','write-properties','write-content','bind','unbind','unlock','read-acl','write-acl','read-current-user-privilege-set','all') ) NOT NULL, "grant_deny" varchar CHECK( "grant_deny" IN ('grant','deny') ) NOT NULL, "protected" boolean NOT NULL DEFAULT (0), "position" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_50c39db6813a50ea6a8df5bec97" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_ebb79d587328df2209f597a5097" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
  }

  /** Reverts the migration: drops the ACE tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`DROP INDEX "IDX_c79662927b5ac586f3f8a3dd17"`);
    await queryRunner.query(`DROP TABLE "file_aces"`);
    await queryRunner.query(`DROP INDEX "IDX_3abf52a6631b5fc54e07d9b723"`);
    await queryRunner.query(`DROP TABLE "collection_aces"`);
  }
}

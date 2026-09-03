import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames `addressbook_changes.address_object_id` to `name` (and drops
 * its nullability): the changed `AddressObject`'s own path segment
 * (`AddressObject.name`, added alongside this migration) is what
 * `sync-collection` needs to report a deletion's href, not its id,
 * which is useless once the row is gone. See the `AddressbookChange`
 * entity's doc comment for the full rationale — this retrofits Große
 * Aufgabe 1's original column, written before `AddressObject` had a
 * separate name to denormalize.
 */
export class RenameAddressbookChangeToName1788469066723
  implements MigrationInterface
{
  name = 'RenameAddressbookChangeToName1788469066723';

  /** Applies the migration: renames `address_object_id` to `name`, non-nullable. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_addressbook_changes"("id", "addressbook_id", "seq", "name", "action", "created_at") SELECT "id", "addressbook_id", "seq", "address_object_id", "action", "created_at" FROM "addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_addressbook_changes" RENAME TO "addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
  }

  /** Reverts the migration: renames `name` back to a nullable `address_object_id`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME TO "temporary_addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_changes"("id", "addressbook_id", "seq", "name", "action", "created_at") SELECT "id", "addressbook_id", "seq", "name", "action", "created_at" FROM "temporary_addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_276a3f5a4492fd033867f68b11"`);
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME TO "temporary_addressbook_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "seq" integer NOT NULL, "address_object_id" varchar, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "addressbook_changes"("id", "addressbook_id", "seq", "address_object_id", "action", "created_at") SELECT "id", "addressbook_id", "seq", "name", "action", "created_at" FROM "temporary_addressbook_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_addressbook_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes" ("addressbook_id", "seq") `,
    );
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `address_objects` table (with its foreign keys to
 * `tenants`, `addressbooks`, and `principals`, and its
 * `(addressbook_id, uid)` unique index) and the `address_object_contents`
 * table (with its unique, cascading-on-delete foreign key to
 * `address_objects`).
 */
export class CreateAddressObjects1788460094389 implements MigrationInterface {
  name = 'CreateAddressObjects1788460094389';

  /** Applies the migration: creates the `address_objects`/`address_object_contents` tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_contents" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "vcard_data" text NOT NULL, CONSTRAINT "UQ_dff0af90d93af4fae8fe08e9fd4" UNIQUE ("address_object_id"), CONSTRAINT "REL_dff0af90d93af4fae8fe08e9fd" UNIQUE ("address_object_id"))`,
    );
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_941fdab999183be409b8482cc30" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at" FROM "address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "address_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_objects" RENAME TO "address_objects"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_contents" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "vcard_data" text NOT NULL, CONSTRAINT "UQ_dff0af90d93af4fae8fe08e9fd4" UNIQUE ("address_object_id"), CONSTRAINT "REL_dff0af90d93af4fae8fe08e9fd" UNIQUE ("address_object_id"), CONSTRAINT "FK_dff0af90d93af4fae8fe08e9fd4" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_contents"("id", "address_object_id", "vcard_data") SELECT "id", "address_object_id", "vcard_data" FROM "address_object_contents"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_contents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_contents" RENAME TO "address_object_contents"`,
    );
  }

  /** Reverts the migration: drops the `address_objects`/`address_object_contents` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "address_object_contents" RENAME TO "temporary_address_object_contents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_contents" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "vcard_data" text NOT NULL, CONSTRAINT "UQ_dff0af90d93af4fae8fe08e9fd4" UNIQUE ("address_object_id"), CONSTRAINT "REL_dff0af90d93af4fae8fe08e9fd" UNIQUE ("address_object_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_contents"("id", "address_object_id", "vcard_data") SELECT "id", "address_object_id", "vcard_data" FROM "temporary_address_object_contents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_contents"`);
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(
      `ALTER TABLE "address_objects" RENAME TO "temporary_address_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at" FROM "temporary_address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_objects"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(`DROP TABLE "address_object_contents"`);
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(`DROP TABLE "address_objects"`);
  }
}

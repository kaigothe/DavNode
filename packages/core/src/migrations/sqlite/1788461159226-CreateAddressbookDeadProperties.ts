import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `addressbook_properties` and `address_object_properties`
 * tables (dead properties, RFC 4918), each with a foreign key to its
 * parent resource and a `(<parent>_id, namespace, name)` unique index.
 * Mirrors `CreateDeadProperties` (M2) for the addressbook domain.
 */
export class CreateAddressbookDeadProperties1788461159226 implements MigrationInterface {
  name = 'CreateAddressbookDeadProperties1788461159226';

  /** Applies the migration: creates the addressbook dead-properties tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "address_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b0642562f4741bb41ba32afb74" ON "address_object_properties" ("address_object_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_properties" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e" ON "addressbook_properties" ("addressbook_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b0642562f4741bb41ba32afb74"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_properties" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_ebd34d3347a1b87beea377d7f4f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
    await queryRunner.query(`DROP INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_addressbook_properties" ("id" varchar PRIMARY KEY NOT NULL, "addressbook_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_f56fbc9b44df33e0dae639055d2" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
  }

  /** Reverts the migration: drops the addressbook dead-properties tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`DROP INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e"`);
    await queryRunner.query(`DROP TABLE "addressbook_properties"`);
    await queryRunner.query(`DROP INDEX "IDX_b0642562f4741bb41ba32afb74"`);
    await queryRunner.query(`DROP TABLE "address_object_properties"`);
  }
}

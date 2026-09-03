import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `address_object_indexes` table (the vCard search index,
 * planning/05-data-model.md's `AddressObjectIndex`) with its
 * cascading-on-delete foreign key to `address_objects` and its
 * `address_object_id` index (the shape `indexVCard`'s
 * delete-then-repopulate operation queries by).
 */
export class CreateAddressObjectIndex1788464771752
  implements MigrationInterface
{
  name = 'CreateAddressObjectIndex1788464771752';

  /** Applies the migration: creates the `address_object_indexes` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "address_object_indexes" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "property_name" varchar NOT NULL, "property_value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ffe9219aa5f273f7d85a0eeba9" ON "address_object_indexes" ("address_object_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ffe9219aa5f273f7d85a0eeba9"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_object_indexes" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "property_name" varchar NOT NULL, "property_value" text NOT NULL, CONSTRAINT "FK_ffe9219aa5f273f7d85a0eeba9c" FOREIGN KEY ("address_object_id") REFERENCES "address_objects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_object_indexes"("id", "address_object_id", "property_name", "property_value") SELECT "id", "address_object_id", "property_name", "property_value" FROM "address_object_indexes"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_indexes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_object_indexes" RENAME TO "address_object_indexes"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ffe9219aa5f273f7d85a0eeba9" ON "address_object_indexes" ("address_object_id") `,
    );
  }

  /** Reverts the migration: drops the `address_object_indexes` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ffe9219aa5f273f7d85a0eeba9"`);
    await queryRunner.query(
      `ALTER TABLE "address_object_indexes" RENAME TO "temporary_address_object_indexes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_indexes" ("id" varchar PRIMARY KEY NOT NULL, "address_object_id" varchar NOT NULL, "property_name" varchar NOT NULL, "property_value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_object_indexes"("id", "address_object_id", "property_name", "property_value") SELECT "id", "address_object_id", "property_name", "property_value" FROM "temporary_address_object_indexes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_object_indexes"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_ffe9219aa5f273f7d85a0eeba9" ON "address_object_indexes" ("address_object_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ffe9219aa5f273f7d85a0eeba9"`);
    await queryRunner.query(`DROP TABLE "address_object_indexes"`);
  }
}

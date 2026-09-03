import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `addressbook_properties` and `address_object_properties`
 * tables (dead properties, RFC 4918), each with a foreign key to its
 * parent resource and a `(<parent>_id, namespace, name)` unique index.
 * Mirrors `CreateDeadProperties` (M2) for the addressbook domain.
 */
export class CreateAddressbookDeadProperties1788461240312
  implements MigrationInterface
{
  name = 'CreateAddressbookDeadProperties1788461240312';

  /** Applies the migration: creates the addressbook dead-properties tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "address_object_properties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "address_object_id" uuid NOT NULL, "namespace" character varying NOT NULL, "name" character varying NOT NULL, "value" text NOT NULL, CONSTRAINT "PK_f92f05644a00e00f421199623b0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b0642562f4741bb41ba32afb74" ON "address_object_properties"  ("address_object_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_properties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "addressbook_id" uuid NOT NULL, "namespace" character varying NOT NULL, "name" character varying NOT NULL, "value" text NOT NULL, CONSTRAINT "PK_f6b310966a7ea5b0792d88b7381" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd8c442f1a46c6ce5e91cfd97e" ON "addressbook_properties"  ("addressbook_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_properties" ADD CONSTRAINT "FK_ebd34d3347a1b87beea377d7f4f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_properties" ADD CONSTRAINT "FK_f56fbc9b44df33e0dae639055d2" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the addressbook dead-properties tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "addressbook_properties" DROP CONSTRAINT "FK_f56fbc9b44df33e0dae639055d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_properties" DROP CONSTRAINT "FK_ebd34d3347a1b87beea377d7f4f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fd8c442f1a46c6ce5e91cfd97e"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_properties"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b0642562f4741bb41ba32afb74"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_properties"`);
  }
}

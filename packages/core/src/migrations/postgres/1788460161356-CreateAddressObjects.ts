import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `address_objects` table (with its foreign keys to
 * `tenants`, `addressbooks`, and `principals`, and its
 * `(addressbook_id, uid)` unique index) and the `address_object_contents`
 * table (with its unique, cascading-on-delete foreign key to
 * `address_objects`).
 */
export class CreateAddressObjects1788460161356 implements MigrationInterface {
  name = 'CreateAddressObjects1788460161356';

  /** Applies the migration: creates the `address_objects`/`address_object_contents` tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "address_objects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "addressbook_id" uuid NOT NULL, "uid" character varying NOT NULL, "etag" character varying NOT NULL, "owner_principal_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_28a0c0a8bbb572109ee89ca0c5d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects"  ("addressbook_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_contents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "address_object_id" uuid NOT NULL, "vcard_data" text NOT NULL, CONSTRAINT "UQ_dff0af90d93af4fae8fe08e9fd4" UNIQUE ("address_object_id"), CONSTRAINT "REL_dff0af90d93af4fae8fe08e9fd" UNIQUE ("address_object_id"), CONSTRAINT "PK_95eb67490703f9dcd042f976d80" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_objects" ADD CONSTRAINT "FK_941fdab999183be409b8482cc30" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_objects" ADD CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_objects" ADD CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8" FOREIGN KEY ("owner_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_contents" ADD CONSTRAINT "FK_dff0af90d93af4fae8fe08e9fd4" FOREIGN KEY ("address_object_id") REFERENCES "address_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `address_objects`/`address_object_contents` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "address_object_contents" DROP CONSTRAINT "FK_dff0af90d93af4fae8fe08e9fd4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_objects" DROP CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_objects" DROP CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_objects" DROP CONSTRAINT "FK_941fdab999183be409b8482cc30"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_contents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ed512269f98f4f1532c0e26330"`,
    );
    await queryRunner.query(`DROP TABLE "address_objects"`);
  }
}

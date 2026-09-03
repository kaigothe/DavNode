import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `addressbooks` table, its foreign keys to `tenants` and
 * `principals`, and its `(tenant_id, owner_principal_id)` index. Unlike
 * `collections`, there is no unique index on `(tenant_id)` — a principal
 * may own more than one addressbook.
 */
export class CreateAddressbooks1788454937078 implements MigrationInterface {
  name = 'CreateAddressbooks1788454937078';

  /** Applies the migration: creates the `addressbooks` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "addressbooks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "owner_principal_id" uuid NOT NULL, "display_name" character varying NOT NULL, "description" text, "sync_seq" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_25232c426b691d3c01a66373590" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15f92e8fb407a8f6716988c97a" ON "addressbooks"  ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbooks" ADD CONSTRAINT "FK_827be781a4d20fcdfbce2ab6dbc" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbooks" ADD CONSTRAINT "FK_a662f034e11bb9660ecde042be4" FOREIGN KEY ("owner_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `addressbooks` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "addressbooks" DROP CONSTRAINT "FK_a662f034e11bb9660ecde042be4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbooks" DROP CONSTRAINT "FK_827be781a4d20fcdfbce2ab6dbc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_15f92e8fb407a8f6716988c97a"`,
    );
    await queryRunner.query(`DROP TABLE "addressbooks"`);
  }
}

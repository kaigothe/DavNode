import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `file_resources` table (with its foreign keys to `tenants`,
 * `collections`, and `principals`, and its `(collection_id, name)`
 * unique index) and the `file_contents` table (with its unique,
 * cascading-on-delete foreign key to `file_resources`).
 */
export class CreateFileResources1788217588594 implements MigrationInterface {
  name = 'CreateFileResources1788217588594';

  /** Applies the migration: creates the `file_resources`/`file_contents` tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "file_resources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "collection_id" uuid NOT NULL, "name" character varying NOT NULL, "content_type" character varying NOT NULL, "etag" character varying NOT NULL, "size_bytes" bigint NOT NULL, "owner_principal_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d5c5a808f5bb892280d02111fe0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_90ecec466b9a944eac782cf60e" ON "file_resources"  ("collection_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "file_contents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "file_resource_id" uuid NOT NULL, "data" bytea NOT NULL, CONSTRAINT "UQ_df2cad8fa50c3d3902d9aff0ccb" UNIQUE ("file_resource_id"), CONSTRAINT "REL_df2cad8fa50c3d3902d9aff0cc" UNIQUE ("file_resource_id"), CONSTRAINT "PK_afd31793055af9c39c6489d5267" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_resources" ADD CONSTRAINT "FK_8c9f2d57f09fbab834254cdb351" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_resources" ADD CONSTRAINT "FK_79f179ded1331d56c1d77f35cbd" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_resources" ADD CONSTRAINT "FK_088edeb6366943a9d94f8272d38" FOREIGN KEY ("owner_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_contents" ADD CONSTRAINT "FK_df2cad8fa50c3d3902d9aff0ccb" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `file_resources`/`file_contents` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "file_contents" DROP CONSTRAINT "FK_df2cad8fa50c3d3902d9aff0ccb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_resources" DROP CONSTRAINT "FK_088edeb6366943a9d94f8272d38"`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_resources" DROP CONSTRAINT "FK_79f179ded1331d56c1d77f35cbd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_resources" DROP CONSTRAINT "FK_8c9f2d57f09fbab834254cdb351"`,
    );
    await queryRunner.query(`DROP TABLE "file_contents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_90ecec466b9a944eac782cf60e"`,
    );
    await queryRunner.query(`DROP TABLE "file_resources"`);
  }
}

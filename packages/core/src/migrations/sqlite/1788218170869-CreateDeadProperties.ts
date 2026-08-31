import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_properties` and `file_properties` tables (dead
 * properties, RFC 4918), each with a foreign key to its parent resource
 * and a `(<parent>_id, namespace, name)` unique index.
 */
export class CreateDeadProperties1788218170869 implements MigrationInterface {
  name = 'CreateDeadProperties1788218170869';

  /** Applies the migration: creates the dead-properties tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_10670fbbd7f617aab66b2fbb0ec" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_properties"("id", "collection_id", "namespace", "name", "value") SELECT "id", "collection_id", "namespace", "name", "value" FROM "collection_properties"`,
    );
    await queryRunner.query(`DROP TABLE "collection_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_properties" RENAME TO "collection_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL, CONSTRAINT "FK_2a9a1fa9b9b0fdd99af45f85381" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_file_properties"("id", "file_resource_id", "namespace", "name", "value") SELECT "id", "file_resource_id", "namespace", "name", "value" FROM "file_properties"`,
    );
    await queryRunner.query(`DROP TABLE "file_properties"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_file_properties" RENAME TO "file_properties"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
  }

  /** Reverts the migration: drops the dead-properties tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(
      `ALTER TABLE "file_properties" RENAME TO "temporary_file_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_properties" ("id" varchar PRIMARY KEY NOT NULL, "file_resource_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "file_properties"("id", "file_resource_id", "namespace", "name", "value") SELECT "id", "file_resource_id", "namespace", "name", "value" FROM "temporary_file_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_file_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_776b10522806026cb0b5446547" ON "file_properties" ("file_resource_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(
      `ALTER TABLE "collection_properties" RENAME TO "temporary_collection_properties"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_properties" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_properties"("id", "collection_id", "namespace", "name", "value") SELECT "id", "collection_id", "namespace", "name", "value" FROM "temporary_collection_properties"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_properties"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25effb2be14e2f57cf294ffbe6" ON "collection_properties" ("collection_id", "namespace", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_776b10522806026cb0b5446547"`);
    await queryRunner.query(`DROP TABLE "file_properties"`);
    await queryRunner.query(`DROP INDEX "IDX_25effb2be14e2f57cf294ffbe6"`);
    await queryRunner.query(`DROP TABLE "collection_properties"`);
  }
}

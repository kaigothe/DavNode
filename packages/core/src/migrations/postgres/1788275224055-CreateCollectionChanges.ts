import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_changes` table (change-log for a collection's
 * direct children, groundwork for the `sync-collection` REPORT, M4),
 * with a foreign key to its parent collection and a
 * `(collection_id, seq)` unique index.
 */
export class CreateCollectionChanges1788275224055 implements MigrationInterface {
  name = 'CreateCollectionChanges1788275224055';

  /** Applies the migration: creates the `collection_changes` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."collection_changes_action_enum" AS ENUM('added', 'modified', 'deleted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_changes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "collection_id" uuid NOT NULL, "seq" integer NOT NULL, "name" character varying NOT NULL, "action" "public"."collection_changes_action_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_50bab2bb3f7377aaa988f9acf49" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes"  ("collection_id", "seq") `,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_changes" ADD CONSTRAINT "FK_3d0591021c856656a4f74355888" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `collection_changes` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collection_changes" DROP CONSTRAINT "FK_3d0591021c856656a4f74355888"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ae4b57cce0ca1572c16c69b130"`,
    );
    await queryRunner.query(`DROP TABLE "collection_changes"`);
    await queryRunner.query(
      `DROP TYPE "public"."collection_changes_action_enum"`,
    );
  }
}

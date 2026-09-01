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
      `CREATE TABLE "collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_3d0591021c856656a4f74355888" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_changes"("id", "collection_id", "seq", "name", "action", "created_at") SELECT "id", "collection_id", "seq", "name", "action", "created_at" FROM "collection_changes"`,
    );
    await queryRunner.query(`DROP TABLE "collection_changes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_changes" RENAME TO "collection_changes"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
  }

  /** Reverts the migration: drops the `collection_changes` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(
      `ALTER TABLE "collection_changes" RENAME TO "temporary_collection_changes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_changes" ("id" varchar PRIMARY KEY NOT NULL, "collection_id" varchar NOT NULL, "seq" integer NOT NULL, "name" varchar NOT NULL, "action" varchar CHECK( "action" IN ('added','modified','deleted') ) NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_changes"("id", "collection_id", "seq", "name", "action", "created_at") SELECT "id", "collection_id", "seq", "name", "action", "created_at" FROM "temporary_collection_changes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_changes"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae4b57cce0ca1572c16c69b130" ON "collection_changes" ("collection_id", "seq") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_ae4b57cce0ca1572c16c69b130"`);
    await queryRunner.query(`DROP TABLE "collection_changes"`);
  }
}

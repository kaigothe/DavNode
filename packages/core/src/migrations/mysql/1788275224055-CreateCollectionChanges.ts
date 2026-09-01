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
      `CREATE TABLE \`collection_changes\` (\`id\` varchar(36) NOT NULL, \`collection_id\` varchar(255) NOT NULL, \`seq\` int NOT NULL, \`name\` varchar(255) NOT NULL, \`action\` enum ('added', 'modified', 'deleted') NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_ae4b57cce0ca1572c16c69b130\` (\`collection_id\`, \`seq\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_changes\` ADD CONSTRAINT \`FK_3d0591021c856656a4f74355888\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `collection_changes` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`collection_changes\` DROP FOREIGN KEY \`FK_3d0591021c856656a4f74355888\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ae4b57cce0ca1572c16c69b130\` ON \`collection_changes\``,
    );
    await queryRunner.query(`DROP TABLE \`collection_changes\``);
  }
}

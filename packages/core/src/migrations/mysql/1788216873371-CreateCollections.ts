import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collections` table, its foreign keys to `tenants`,
 * `principals`, and (self-referencing) `collections`, and its
 * `(tenant_id, parent_collection_id)` index.
 *
 * Unlike `migrations/sqlite/` and `migrations/postgres/`, there is
 * **no** unique index enforcing "at most one root collection per
 * tenant" here — see the comment in `up()`.
 */
export class CreateCollections1788216873371 implements MigrationInterface {
  name = 'CreateCollections1788216873371';

  /** Applies the migration: creates the `collections` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // No unique index on ("tenant_id") here, unlike sqlite/postgres:
    // MySQL has no partial/filtered index support, so the "at most one
    // root collection per tenant" invariant (WHERE parent_collection_id
    // IS NULL on the other two engines) can't be expressed as a MySQL
    // index at all — a plain UNIQUE(tenant_id) would instead cap every
    // tenant at exactly one collection, period, which is wrong. This is
    // enforced at the application level instead (see CollectionService,
    // once it exists) for MySQL specifically.
    await queryRunner.query(
      `CREATE TABLE \`collections\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`parent_collection_id\` varchar(255) NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`display_name\` varchar(255) NOT NULL, \`sync_seq\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_b1f9acafe3155bf27c4e903e46\` (\`tenant_id\`, \`parent_collection_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_540dccbd82902e2d164ca91ca6d\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_921059bf974517bd075d9c81061\` FOREIGN KEY (\`parent_collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` ADD CONSTRAINT \`FK_924c3e536070041d78a1ade1c03\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `collections` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_924c3e536070041d78a1ade1c03\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_921059bf974517bd075d9c81061\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collections\` DROP FOREIGN KEY \`FK_540dccbd82902e2d164ca91ca6d\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_b1f9acafe3155bf27c4e903e46\` ON \`collections\``,
    );
    await queryRunner.query(`DROP TABLE \`collections\``);
  }
}

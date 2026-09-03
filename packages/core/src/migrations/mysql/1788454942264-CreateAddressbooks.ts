import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `addressbooks` table, its foreign keys to `tenants` and
 * `principals`, and its `(tenant_id, owner_principal_id)` index. Unlike
 * `collections`, there is no unique-index special-casing needed here —
 * this table never had a "one root per tenant" invariant to express in
 * the first place, so it needs no MySQL-specific deviation from the
 * sqlite/postgres migrations.
 */
export class CreateAddressbooks1788454942264 implements MigrationInterface {
  name = 'CreateAddressbooks1788454942264';

  /** Applies the migration: creates the `addressbooks` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`addressbooks\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`display_name\` varchar(255) NOT NULL, \`description\` text NULL, \`sync_seq\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_15f92e8fb407a8f6716988c97a\` (\`tenant_id\`, \`owner_principal_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` ADD CONSTRAINT \`FK_827be781a4d20fcdfbce2ab6dbc\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` ADD CONSTRAINT \`FK_a662f034e11bb9660ecde042be4\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `addressbooks` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` DROP FOREIGN KEY \`FK_a662f034e11bb9660ecde042be4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbooks\` DROP FOREIGN KEY \`FK_827be781a4d20fcdfbce2ab6dbc\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_15f92e8fb407a8f6716988c97a\` ON \`addressbooks\``,
    );
    await queryRunner.query(`DROP TABLE \`addressbooks\``);
  }
}

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
      `CREATE TABLE \`collection_properties\` (\`id\` varchar(36) NOT NULL, \`collection_id\` varchar(255) NOT NULL, \`namespace\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`value\` text NOT NULL, UNIQUE INDEX \`IDX_25effb2be14e2f57cf294ffbe6\` (\`collection_id\`, \`namespace\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`file_properties\` (\`id\` varchar(36) NOT NULL, \`file_resource_id\` varchar(255) NOT NULL, \`namespace\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`value\` text NOT NULL, UNIQUE INDEX \`IDX_776b10522806026cb0b5446547\` (\`file_resource_id\`, \`namespace\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_properties\` ADD CONSTRAINT \`FK_10670fbbd7f617aab66b2fbb0ec\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_properties\` ADD CONSTRAINT \`FK_2a9a1fa9b9b0fdd99af45f85381\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the dead-properties tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`file_properties\` DROP FOREIGN KEY \`FK_2a9a1fa9b9b0fdd99af45f85381\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_properties\` DROP FOREIGN KEY \`FK_10670fbbd7f617aab66b2fbb0ec\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_776b10522806026cb0b5446547\` ON \`file_properties\``,
    );
    await queryRunner.query(`DROP TABLE \`file_properties\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_25effb2be14e2f57cf294ffbe6\` ON \`collection_properties\``,
    );
    await queryRunner.query(`DROP TABLE \`collection_properties\``);
  }
}

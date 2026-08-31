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
      `CREATE TABLE \`file_resources\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`collection_id\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`content_type\` varchar(255) NOT NULL, \`etag\` varchar(255) NOT NULL, \`size_bytes\` bigint NOT NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_90ecec466b9a944eac782cf60e\` (\`collection_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`file_contents\` (\`id\` varchar(36) NOT NULL, \`file_resource_id\` varchar(255) NOT NULL, \`data\` longblob NOT NULL, UNIQUE INDEX \`IDX_df2cad8fa50c3d3902d9aff0cc\` (\`file_resource_id\`), UNIQUE INDEX \`REL_df2cad8fa50c3d3902d9aff0cc\` (\`file_resource_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_8c9f2d57f09fbab834254cdb351\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_79f179ded1331d56c1d77f35cbd\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` ADD CONSTRAINT \`FK_088edeb6366943a9d94f8272d38\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_contents\` ADD CONSTRAINT \`FK_df2cad8fa50c3d3902d9aff0ccb\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `file_resources`/`file_contents` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`file_contents\` DROP FOREIGN KEY \`FK_df2cad8fa50c3d3902d9aff0ccb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_088edeb6366943a9d94f8272d38\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_79f179ded1331d56c1d77f35cbd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_resources\` DROP FOREIGN KEY \`FK_8c9f2d57f09fbab834254cdb351\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_df2cad8fa50c3d3902d9aff0cc\` ON \`file_contents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_df2cad8fa50c3d3902d9aff0cc\` ON \`file_contents\``,
    );
    await queryRunner.query(`DROP TABLE \`file_contents\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_90ecec466b9a944eac782cf60e\` ON \`file_resources\``,
    );
    await queryRunner.query(`DROP TABLE \`file_resources\``);
  }
}

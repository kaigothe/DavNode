import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `address_objects` table (with its foreign keys to
 * `tenants`, `addressbooks`, and `principals`, and its
 * `(addressbook_id, uid)` unique index) and the `address_object_contents`
 * table (with its unique, cascading-on-delete foreign key to
 * `address_objects`).
 */
export class CreateAddressObjects1788460167159 implements MigrationInterface {
  name = 'CreateAddressObjects1788460167159';

  /** Applies the migration: creates the `address_objects`/`address_object_contents` tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`address_objects\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`addressbook_id\` varchar(255) NOT NULL, \`uid\` varchar(255) NOT NULL, \`etag\` varchar(255) NOT NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_ed512269f98f4f1532c0e26330\` (\`addressbook_id\`, \`uid\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`address_object_contents\` (\`id\` varchar(36) NOT NULL, \`address_object_id\` varchar(255) NOT NULL, \`vcard_data\` text NOT NULL, UNIQUE INDEX \`IDX_dff0af90d93af4fae8fe08e9fd\` (\`address_object_id\`), UNIQUE INDEX \`REL_dff0af90d93af4fae8fe08e9fd\` (\`address_object_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_941fdab999183be409b8482cc30\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_cac47f6d742edc4c26aabe7d5c6\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD CONSTRAINT \`FK_1f9ca4955716807c430cb94c3a8\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_contents\` ADD CONSTRAINT \`FK_dff0af90d93af4fae8fe08e9fd4\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `address_objects`/`address_object_contents` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`address_object_contents\` DROP FOREIGN KEY \`FK_dff0af90d93af4fae8fe08e9fd4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_1f9ca4955716807c430cb94c3a8\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_cac47f6d742edc4c26aabe7d5c6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP FOREIGN KEY \`FK_941fdab999183be409b8482cc30\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_dff0af90d93af4fae8fe08e9fd\` ON \`address_object_contents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_dff0af90d93af4fae8fe08e9fd\` ON \`address_object_contents\``,
    );
    await queryRunner.query(`DROP TABLE \`address_object_contents\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_ed512269f98f4f1532c0e26330\` ON \`address_objects\``,
    );
    await queryRunner.query(`DROP TABLE \`address_objects\``);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `address_object_indexes` table (the vCard search index,
 * planning/05-data-model.md's `AddressObjectIndex`) with its
 * cascading-on-delete foreign key to `address_objects` and its
 * `address_object_id` index (the shape `indexVCard`'s
 * delete-then-repopulate operation queries by).
 */
export class CreateAddressObjectIndex1788464858163
  implements MigrationInterface
{
  name = 'CreateAddressObjectIndex1788464858163';

  /** Applies the migration: creates the `address_object_indexes` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`address_object_indexes\` (\`id\` varchar(36) NOT NULL, \`address_object_id\` varchar(255) NOT NULL, \`property_name\` varchar(255) NOT NULL, \`property_value\` text NOT NULL, INDEX \`IDX_ffe9219aa5f273f7d85a0eeba9\` (\`address_object_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_indexes\` ADD CONSTRAINT \`FK_ffe9219aa5f273f7d85a0eeba9c\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `address_object_indexes` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`address_object_indexes\` DROP FOREIGN KEY \`FK_ffe9219aa5f273f7d85a0eeba9c\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ffe9219aa5f273f7d85a0eeba9\` ON \`address_object_indexes\``,
    );
    await queryRunner.query(`DROP TABLE \`address_object_indexes\``);
  }
}

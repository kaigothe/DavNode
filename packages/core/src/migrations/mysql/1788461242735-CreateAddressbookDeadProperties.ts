import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `addressbook_properties` and `address_object_properties`
 * tables (dead properties, RFC 4918), each with a foreign key to its
 * parent resource and a `(<parent>_id, namespace, name)` unique index.
 * Mirrors `CreateDeadProperties` (M2) for the addressbook domain.
 */
export class CreateAddressbookDeadProperties1788461242735
  implements MigrationInterface
{
  name = 'CreateAddressbookDeadProperties1788461242735';

  /** Applies the migration: creates the addressbook dead-properties tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`address_object_properties\` (\`id\` varchar(36) NOT NULL, \`address_object_id\` varchar(255) NOT NULL, \`namespace\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`value\` text NOT NULL, UNIQUE INDEX \`IDX_b0642562f4741bb41ba32afb74\` (\`address_object_id\`, \`namespace\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`addressbook_properties\` (\`id\` varchar(36) NOT NULL, \`addressbook_id\` varchar(255) NOT NULL, \`namespace\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`value\` text NOT NULL, UNIQUE INDEX \`IDX_fd8c442f1a46c6ce5e91cfd97e\` (\`addressbook_id\`, \`namespace\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_properties\` ADD CONSTRAINT \`FK_ebd34d3347a1b87beea377d7f4f\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_properties\` ADD CONSTRAINT \`FK_f56fbc9b44df33e0dae639055d2\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the addressbook dead-properties tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`addressbook_properties\` DROP FOREIGN KEY \`FK_f56fbc9b44df33e0dae639055d2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_properties\` DROP FOREIGN KEY \`FK_ebd34d3347a1b87beea377d7f4f\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_fd8c442f1a46c6ce5e91cfd97e\` ON \`addressbook_properties\``,
    );
    await queryRunner.query(`DROP TABLE \`addressbook_properties\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_b0642562f4741bb41ba32afb74\` ON \`address_object_properties\``,
    );
    await queryRunner.query(`DROP TABLE \`address_object_properties\``);
  }
}

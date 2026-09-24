import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendar_properties` and `calendar_object_properties` tables
 * (dead properties, RFC 4918) with foreign keys to `calendars` and
 * `calendar_objects` and a unique index on `(<resource>_id, namespace, name)`
 * in each, so setting a property again overwrites instead of duplicating.
 */
export class CreateCalendarDeadProperties1790247316104 implements MigrationInterface {
  name = 'CreateCalendarDeadProperties1790247316104';

  /** Applies the migration: creates the calendar dead-property tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`calendar_object_properties\` (\`id\` varchar(36) NOT NULL, \`calendar_object_id\` varchar(255) NOT NULL, \`namespace\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`value\` text NOT NULL, UNIQUE INDEX \`IDX_f9b50cba39e0b74f94b14412e1\` (\`calendar_object_id\`, \`namespace\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`calendar_properties\` (\`id\` varchar(36) NOT NULL, \`calendar_id\` varchar(255) NOT NULL, \`namespace\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`value\` text NOT NULL, UNIQUE INDEX \`IDX_701d82fed3be7d043bd4b21881\` (\`calendar_id\`, \`namespace\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_properties\` ADD CONSTRAINT \`FK_e73274b0de016a20a459f48f587\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_properties\` ADD CONSTRAINT \`FK_58a88e8e32a2363da9fad400578\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the calendar dead-property tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendar_properties\` DROP FOREIGN KEY \`FK_58a88e8e32a2363da9fad400578\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_properties\` DROP FOREIGN KEY \`FK_e73274b0de016a20a459f48f587\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_701d82fed3be7d043bd4b21881\` ON \`calendar_properties\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_properties\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_f9b50cba39e0b74f94b14412e1\` ON \`calendar_object_properties\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_object_properties\``);
  }
}

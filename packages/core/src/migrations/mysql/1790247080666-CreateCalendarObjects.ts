import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendar_objects` table and its `calendar_object_contents` table:
 * foreign keys to `tenants`, `calendars` and `principals`, unique indexes on
 * `(calendar_id, name)` (URL identity) and `(calendar_id, uid)` (RFC 4791
 * §5.3.2.1), the `(calendar_id, dtstart, recurrence_span_end)` index for the
 * time-range prefilter, and `ON DELETE CASCADE` from content to object. The
 * time-range columns are `bigint` epoch milliseconds (see
 * `epochMillisDateTransformer`); on MySQL `ics_data` is `longtext`.
 */
export class CreateCalendarObjects1790247080666 implements MigrationInterface {
  name = 'CreateCalendarObjects1790247080666';

  /** Applies the migration: creates `calendar_objects` and `calendar_object_contents`. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`calendar_objects\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`calendar_id\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`uid\` varchar(255) NOT NULL, \`etag\` varchar(255) NOT NULL, \`component_type\` enum ('VEVENT') NOT NULL, \`owner_principal_id\` varchar(255) NOT NULL, \`dtstart\` bigint NOT NULL, \`dtend\` bigint NULL, \`is_all_day\` tinyint NOT NULL DEFAULT 0, \`recurrence_span_end\` bigint NULL, \`transparency\` enum ('opaque', 'transparent') NOT NULL DEFAULT 'opaque', \`status\` enum ('tentative', 'confirmed', 'cancelled') NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_f6529f5a58f6d5b5bdf732045d\` (\`calendar_id\`, \`dtstart\`, \`recurrence_span_end\`), UNIQUE INDEX \`IDX_1bc73b35cc7ffcd525d356c685\` (\`calendar_id\`, \`uid\`), UNIQUE INDEX \`IDX_363f2351ac90d638ec8871cb6f\` (\`calendar_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`calendar_object_contents\` (\`id\` varchar(36) NOT NULL, \`calendar_object_id\` varchar(255) NOT NULL, \`ics_data\` longtext NOT NULL, UNIQUE INDEX \`IDX_73494e1d9b56babd9c6453de2f\` (\`calendar_object_id\`), UNIQUE INDEX \`REL_73494e1d9b56babd9c6453de2f\` (\`calendar_object_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_5799578b4cbd97d0777d0e3d8d5\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_89ff9f9b2f154fd9aa951719b52\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` ADD CONSTRAINT \`FK_4227fe7c36e614604e245111372\` FOREIGN KEY (\`owner_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_contents\` ADD CONSTRAINT \`FK_73494e1d9b56babd9c6453de2f2\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops `calendar_object_contents` and `calendar_objects`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_contents\` DROP FOREIGN KEY \`FK_73494e1d9b56babd9c6453de2f2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_4227fe7c36e614604e245111372\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_89ff9f9b2f154fd9aa951719b52\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_objects\` DROP FOREIGN KEY \`FK_5799578b4cbd97d0777d0e3d8d5\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_73494e1d9b56babd9c6453de2f\` ON \`calendar_object_contents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_73494e1d9b56babd9c6453de2f\` ON \`calendar_object_contents\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_object_contents\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_363f2351ac90d638ec8871cb6f\` ON \`calendar_objects\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_1bc73b35cc7ffcd525d356c685\` ON \`calendar_objects\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_f6529f5a58f6d5b5bdf732045d\` ON \`calendar_objects\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_objects\``);
  }
}

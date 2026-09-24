import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the calendar domain's ACE, lock and change-log tables: `calendar_aces` and
 * `calendar_object_aces` (RFC 3744, `(<resource>_id, position)` index),
 * `calendar_locks` and `calendar_object_locks` (RFC 4918, unique `token`), and
 * `calendar_changes` (sync-collection log, unique `(calendar_id, seq)`), each
 * with its foreign keys. The ACE `privilege` enum is the shared catalog plus
 * `read-free-busy` (RFC 4791 §6.1.1), which is why it is a calendar-only
 * value list rather than an extension of the other domains' enums.
 */
export class CreateCalendarAcesLocksChanges1790247516912 implements MigrationInterface {
  name = 'CreateCalendarAcesLocksChanges1790247516912';

  /** Applies the migration: creates the calendar ACE, lock and change tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`calendar_aces\` (\`id\` varchar(36) NOT NULL, \`calendar_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`privilege\` enum ('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all', 'read-free-busy') NOT NULL, \`grant_deny\` enum ('grant', 'deny') NOT NULL, \`protected\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_759400fe0dd091c1470185e431\` (\`calendar_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`calendar_changes\` (\`id\` varchar(36) NOT NULL, \`calendar_id\` varchar(255) NOT NULL, \`seq\` int NOT NULL, \`name\` varchar(255) NOT NULL, \`action\` enum ('added', 'modified', 'deleted') NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_0f26b594e2d9732bd75063f3ad\` (\`calendar_id\`, \`seq\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`calendar_locks\` (\`id\` varchar(36) NOT NULL, \`calendar_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`token\` varchar(255) NOT NULL, \`scope\` enum ('exclusive', 'shared') NOT NULL, \`depth\` enum ('zero', 'infinity') NOT NULL, \`timeout_seconds\` int NULL, \`expires_at\` datetime NULL, \`owner_info\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_a2dbab79355593f530c2aa13a6\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`calendar_object_aces\` (\`id\` varchar(36) NOT NULL, \`calendar_object_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`privilege\` enum ('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all', 'read-free-busy') NOT NULL, \`grant_deny\` enum ('grant', 'deny') NOT NULL, \`protected\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_c4da49fc705bcaf5d64ccc7be8\` (\`calendar_object_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`calendar_object_locks\` (\`id\` varchar(36) NOT NULL, \`calendar_object_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`token\` varchar(255) NOT NULL, \`scope\` enum ('exclusive', 'shared') NOT NULL, \`timeout_seconds\` int NULL, \`expires_at\` datetime NULL, \`owner_info\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_686a2b73bcd8d26d8182188259\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` ADD CONSTRAINT \`FK_28bda8f1c6b5f350cefc31434f1\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` ADD CONSTRAINT \`FK_152802f03431b37689985a25433\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_changes\` ADD CONSTRAINT \`FK_77820bd3f3f8a2da07bf884aaf1\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` ADD CONSTRAINT \`FK_0ee2f3b99a467ff1547e4e51fd0\` FOREIGN KEY (\`calendar_id\`) REFERENCES \`calendars\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` ADD CONSTRAINT \`FK_6e35df3bb6e04309c042888ece6\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` ADD CONSTRAINT \`FK_916060d7b0bb5871250a1934b9d\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` ADD CONSTRAINT \`FK_67c6c7c97d8cbcd577410d7aef5\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` ADD CONSTRAINT \`FK_e1de505eba49231332daf503a14\` FOREIGN KEY (\`calendar_object_id\`) REFERENCES \`calendar_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` ADD CONSTRAINT \`FK_bf9308d1ebf2c35711898715ca3\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the calendar ACE, lock and change tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` DROP FOREIGN KEY \`FK_bf9308d1ebf2c35711898715ca3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_locks\` DROP FOREIGN KEY \`FK_e1de505eba49231332daf503a14\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` DROP FOREIGN KEY \`FK_67c6c7c97d8cbcd577410d7aef5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_object_aces\` DROP FOREIGN KEY \`FK_916060d7b0bb5871250a1934b9d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` DROP FOREIGN KEY \`FK_6e35df3bb6e04309c042888ece6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_locks\` DROP FOREIGN KEY \`FK_0ee2f3b99a467ff1547e4e51fd0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_changes\` DROP FOREIGN KEY \`FK_77820bd3f3f8a2da07bf884aaf1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` DROP FOREIGN KEY \`FK_152802f03431b37689985a25433\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_aces\` DROP FOREIGN KEY \`FK_28bda8f1c6b5f350cefc31434f1\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_686a2b73bcd8d26d8182188259\` ON \`calendar_object_locks\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_object_locks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_c4da49fc705bcaf5d64ccc7be8\` ON \`calendar_object_aces\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_object_aces\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_a2dbab79355593f530c2aa13a6\` ON \`calendar_locks\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_locks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_0f26b594e2d9732bd75063f3ad\` ON \`calendar_changes\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_changes\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_759400fe0dd091c1470185e431\` ON \`calendar_aces\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_aces\``);
  }
}

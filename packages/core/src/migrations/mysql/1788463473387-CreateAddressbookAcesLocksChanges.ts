import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the addressbook domain's ACE, lock, and change-log tables:
 * `addressbook_aces`/`address_object_aces` (mirrors `CreateAces`, M3),
 * `addressbook_locks`/`address_object_locks` (mirrors `CreateLocks`,
 * M4), and `addressbook_changes` (mirrors `CreateCollectionChanges`,
 * M4). Index strategy matches those WebDAV originals 1:1: non-unique
 * `(<parent>_id, position)` on the ACE tables, a table-wide unique
 * `token` on the lock tables, and a unique `(addressbook_id, seq)` on
 * the change table. `addressbook_changes.address_object_id` has no
 * foreign key — see the `AddressbookChange` entity's doc comment for
 * why.
 */
export class CreateAddressbookAcesLocksChanges1788463473387
  implements MigrationInterface
{
  name = 'CreateAddressbookAcesLocksChanges1788463473387';

  /** Applies the migration: creates the addressbook ACE/lock/change tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`address_object_aces\` (\`id\` varchar(36) NOT NULL, \`address_object_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`privilege\` enum ('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all') NOT NULL, \`grant_deny\` enum ('grant', 'deny') NOT NULL, \`protected\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_cea5558e69223650915eaaaddb\` (\`address_object_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`address_object_locks\` (\`id\` varchar(36) NOT NULL, \`address_object_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`token\` varchar(255) NOT NULL, \`scope\` enum ('exclusive', 'shared') NOT NULL, \`timeout_seconds\` int NULL, \`expires_at\` datetime NULL, \`owner_info\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_254bcdf1b251c770800bd6df00\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`addressbook_aces\` (\`id\` varchar(36) NOT NULL, \`addressbook_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`privilege\` enum ('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all') NOT NULL, \`grant_deny\` enum ('grant', 'deny') NOT NULL, \`protected\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_7b49272b392aee3f6aa8152244\` (\`addressbook_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`addressbook_changes\` (\`id\` varchar(36) NOT NULL, \`addressbook_id\` varchar(255) NOT NULL, \`seq\` int NOT NULL, \`address_object_id\` varchar(255) NULL, \`action\` enum ('added', 'modified', 'deleted') NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_276a3f5a4492fd033867f68b11\` (\`addressbook_id\`, \`seq\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`addressbook_locks\` (\`id\` varchar(36) NOT NULL, \`addressbook_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`token\` varchar(255) NOT NULL, \`scope\` enum ('exclusive', 'shared') NOT NULL, \`depth\` enum ('zero', 'infinity') NOT NULL, \`timeout_seconds\` int NULL, \`expires_at\` datetime NULL, \`owner_info\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_2aba142fc16c2de2453f0a2a87\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` ADD CONSTRAINT \`FK_58bf92e28b478c6534cf5b4bf0b\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` ADD CONSTRAINT \`FK_b8a7194ed4db62f4c1ec874d72a\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` ADD CONSTRAINT \`FK_caa2e72e6b5b67f465e5df6598f\` FOREIGN KEY (\`address_object_id\`) REFERENCES \`address_objects\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` ADD CONSTRAINT \`FK_e5a26600f217355768c3e161054\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` ADD CONSTRAINT \`FK_163408d6e9b1ffcaeff70a7f66d\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` ADD CONSTRAINT \`FK_c0286abf23a6997225d554626ec\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` ADD CONSTRAINT \`FK_b2f635ae5860db28022e7647287\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` ADD CONSTRAINT \`FK_a5a7e6ff45ec59e71ebd88fa4c1\` FOREIGN KEY (\`addressbook_id\`) REFERENCES \`addressbooks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` ADD CONSTRAINT \`FK_5f3ebcdd331c93c69997e0670b1\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the addressbook ACE/lock/change tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` DROP FOREIGN KEY \`FK_5f3ebcdd331c93c69997e0670b1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_locks\` DROP FOREIGN KEY \`FK_a5a7e6ff45ec59e71ebd88fa4c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` DROP FOREIGN KEY \`FK_b2f635ae5860db28022e7647287\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` DROP FOREIGN KEY \`FK_c0286abf23a6997225d554626ec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`addressbook_aces\` DROP FOREIGN KEY \`FK_163408d6e9b1ffcaeff70a7f66d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` DROP FOREIGN KEY \`FK_e5a26600f217355768c3e161054\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_locks\` DROP FOREIGN KEY \`FK_caa2e72e6b5b67f465e5df6598f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` DROP FOREIGN KEY \`FK_b8a7194ed4db62f4c1ec874d72a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_object_aces\` DROP FOREIGN KEY \`FK_58bf92e28b478c6534cf5b4bf0b\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_2aba142fc16c2de2453f0a2a87\` ON \`addressbook_locks\``,
    );
    await queryRunner.query(`DROP TABLE \`addressbook_locks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_276a3f5a4492fd033867f68b11\` ON \`addressbook_changes\``,
    );
    await queryRunner.query(`DROP TABLE \`addressbook_changes\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_7b49272b392aee3f6aa8152244\` ON \`addressbook_aces\``,
    );
    await queryRunner.query(`DROP TABLE \`addressbook_aces\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_254bcdf1b251c770800bd6df00\` ON \`address_object_locks\``,
    );
    await queryRunner.query(`DROP TABLE \`address_object_locks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_cea5558e69223650915eaaaddb\` ON \`address_object_aces\``,
    );
    await queryRunner.query(`DROP TABLE \`address_object_aces\``);
  }
}

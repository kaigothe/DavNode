import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_aces` and `file_aces` tables (RFC 3744 access
 * control entries), each with foreign keys to its parent resource and to
 * `principals`, and a `(<parent>_id, position)` index for the
 * evaluation-order query the ACL evaluation engine relies on.
 */
export class CreateAces1788279378630 implements MigrationInterface {
  name = 'CreateAces1788279378630';

  /** Applies the migration: creates the ACE tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`collection_aces\` (\`id\` varchar(36) NOT NULL, \`collection_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`privilege\` enum ('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all') NOT NULL, \`grant_deny\` enum ('grant', 'deny') NOT NULL, \`protected\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_3abf52a6631b5fc54e07d9b723\` (\`collection_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`file_aces\` (\`id\` varchar(36) NOT NULL, \`file_resource_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`privilege\` enum ('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all') NOT NULL, \`grant_deny\` enum ('grant', 'deny') NOT NULL, \`protected\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_c79662927b5ac586f3f8a3dd17\` (\`file_resource_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` ADD CONSTRAINT \`FK_af5769209aee6853ae7011138c1\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` ADD CONSTRAINT \`FK_b0777647b1b015e4305f5782b09\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` ADD CONSTRAINT \`FK_50c39db6813a50ea6a8df5bec97\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` ADD CONSTRAINT \`FK_ebb79d587328df2209f597a5097\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the ACE tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` DROP FOREIGN KEY \`FK_ebb79d587328df2209f597a5097\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_aces\` DROP FOREIGN KEY \`FK_50c39db6813a50ea6a8df5bec97\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` DROP FOREIGN KEY \`FK_b0777647b1b015e4305f5782b09\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_aces\` DROP FOREIGN KEY \`FK_af5769209aee6853ae7011138c1\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_c79662927b5ac586f3f8a3dd17\` ON \`file_aces\``,
    );
    await queryRunner.query(`DROP TABLE \`file_aces\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_3abf52a6631b5fc54e07d9b723\` ON \`collection_aces\``,
    );
    await queryRunner.query(`DROP TABLE \`collection_aces\``);
  }
}

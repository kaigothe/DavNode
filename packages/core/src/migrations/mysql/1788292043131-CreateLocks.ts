import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_locks` and `file_locks` tables (RFC 4918 §7–9
 * WebDAV locks), each with foreign keys to its parent resource and to
 * `principals`, and a unique index on `token` (global lookup for UNLOCK
 * and `If`-header validation).
 */
export class CreateLocks1788292043131 implements MigrationInterface {
  name = 'CreateLocks1788292043131';

  /** Applies the migration: creates the lock tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`collection_locks\` (\`id\` varchar(36) NOT NULL, \`collection_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`token\` varchar(255) NOT NULL, \`scope\` enum ('exclusive', 'shared') NOT NULL, \`depth\` enum ('zero', 'infinity') NOT NULL, \`timeout_seconds\` int NULL, \`expires_at\` datetime NULL, \`owner_info\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_4e4ae75a7ea5ad17f7a06d207c\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`file_locks\` (\`id\` varchar(36) NOT NULL, \`file_resource_id\` varchar(255) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`token\` varchar(255) NOT NULL, \`scope\` enum ('exclusive', 'shared') NOT NULL, \`timeout_seconds\` int NULL, \`expires_at\` datetime NULL, \`owner_info\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_8b6ffd73906276f27b80fc450e\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` ADD CONSTRAINT \`FK_52fa819b7afe6c73b9ac90ff8c7\` FOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` ADD CONSTRAINT \`FK_b687c1bbac285cec3a98cf3efee\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` ADD CONSTRAINT \`FK_dd3be5955135ee49f14388907c1\` FOREIGN KEY (\`file_resource_id\`) REFERENCES \`file_resources\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` ADD CONSTRAINT \`FK_f54427bf1772f846bdbeddc7e55\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the lock tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` DROP FOREIGN KEY \`FK_f54427bf1772f846bdbeddc7e55\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`file_locks\` DROP FOREIGN KEY \`FK_dd3be5955135ee49f14388907c1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` DROP FOREIGN KEY \`FK_b687c1bbac285cec3a98cf3efee\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`collection_locks\` DROP FOREIGN KEY \`FK_52fa819b7afe6c73b9ac90ff8c7\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_8b6ffd73906276f27b80fc450e\` ON \`file_locks\``,
    );
    await queryRunner.query(`DROP TABLE \`file_locks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_4e4ae75a7ea5ad17f7a06d207c\` ON \`collection_locks\``,
    );
    await queryRunner.query(`DROP TABLE \`collection_locks\``);
  }
}

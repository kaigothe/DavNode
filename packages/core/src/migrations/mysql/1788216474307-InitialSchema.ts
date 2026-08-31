import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the full M1 schema (`tenants`, `principals`, `users`,
 * `credentials`, `groups`, `group_memberships`) for MySQL in one
 * migration. Unlike `migrations/sqlite/`, which has one migration per
 * M1 sub-task, this is generated retroactively in one shot: MySQL never
 * ran an earlier version of the schema, so there's no real history to
 * split into separate steps. From here on, new migrations are generated
 * incrementally, in step with `migrations/sqlite/` and
 * `migrations/postgres/` — see `packages/core/README.md`.
 */
export class InitialSchema1788216474307 implements MigrationInterface {
  name = 'InitialSchema1788216474307';

  /** Applies the migration: creates the full M1 schema. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`tenants\` (\`id\` varchar(36) NOT NULL, \`slug\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`quota_limit_bytes\` bigint NULL, \`quota_used_bytes\` bigint NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_2310ecc5cb8be427097154b18f\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`principals\` (\`id\` varchar(36) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`kind\` enum ('user', 'group', 'special') NOT NULL, \`special_kind\` enum ('authenticated', 'unauthenticated', 'all', 'owner', 'self') NULL, INDEX \`IDX_c2d13b5eb8cace20c9b2478375\` (\`tenant_id\`, \`kind\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` varchar(36) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`username\` varchar(255) NOT NULL, \`email\` varchar(255) NOT NULL, \`quota_limit_bytes\` bigint NULL, \`quota_used_bytes\` bigint NOT NULL DEFAULT '0', \`role\` enum ('member', 'tenant_admin', 'server_admin') NOT NULL DEFAULT 'member', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_52a29f8fc340e73d124af517f2\` (\`tenant_id\`, \`username\`), UNIQUE INDEX \`IDX_77a9a771ebc3370f1af5273634\` (\`principal_id\`), UNIQUE INDEX \`REL_77a9a771ebc3370f1af5273634\` (\`principal_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`credentials\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(255) NOT NULL, \`type\` enum ('basic') NOT NULL, \`password_hash\` varchar(255) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_12644270511e5e10c22110d30a\` (\`user_id\`, \`type\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`groups\` (\`id\` varchar(36) NOT NULL, \`principal_id\` varchar(255) NOT NULL, \`tenant_id\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, UNIQUE INDEX \`IDX_5a92873f80fa97cf9e687c77b8\` (\`tenant_id\`, \`name\`), UNIQUE INDEX \`IDX_49c3ac49d10e25bf2434234fcb\` (\`principal_id\`), UNIQUE INDEX \`REL_49c3ac49d10e25bf2434234fcb\` (\`principal_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`group_memberships\` (\`id\` varchar(36) NOT NULL, \`group_id\` varchar(255) NOT NULL, \`member_principal_id\` varchar(255) NOT NULL, UNIQUE INDEX \`IDX_c8d5d2c5811193f02f82307e46\` (\`group_id\`, \`member_principal_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`principals\` ADD CONSTRAINT \`FK_f0e7950772e6b6aca9c6f78a525\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_77a9a771ebc3370f1af52736343\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_109638590074998bb72a2f2cf08\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` ADD CONSTRAINT \`FK_c68a6c53e95a7dc357f4ebce8f0\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD CONSTRAINT \`FK_49c3ac49d10e25bf2434234fcbe\` FOREIGN KEY (\`principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD CONSTRAINT \`FK_245f58bdfb3e9529b4100d9c5e7\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` ADD CONSTRAINT \`FK_cad344fe877fcee0ac7e065ed05\` FOREIGN KEY (\`group_id\`) REFERENCES \`groups\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` ADD CONSTRAINT \`FK_0e588f4e5fa5ddd066e35521540\` FOREIGN KEY (\`member_principal_id\`) REFERENCES \`principals\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the full M1 schema. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` DROP FOREIGN KEY \`FK_0e588f4e5fa5ddd066e35521540\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_memberships\` DROP FOREIGN KEY \`FK_cad344fe877fcee0ac7e065ed05\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP FOREIGN KEY \`FK_245f58bdfb3e9529b4100d9c5e7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP FOREIGN KEY \`FK_49c3ac49d10e25bf2434234fcbe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`credentials\` DROP FOREIGN KEY \`FK_c68a6c53e95a7dc357f4ebce8f0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_109638590074998bb72a2f2cf08\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_77a9a771ebc3370f1af52736343\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`principals\` DROP FOREIGN KEY \`FK_f0e7950772e6b6aca9c6f78a525\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_c8d5d2c5811193f02f82307e46\` ON \`group_memberships\``,
    );
    await queryRunner.query(`DROP TABLE \`group_memberships\``);
    await queryRunner.query(
      `DROP INDEX \`REL_49c3ac49d10e25bf2434234fcb\` ON \`groups\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_49c3ac49d10e25bf2434234fcb\` ON \`groups\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_5a92873f80fa97cf9e687c77b8\` ON \`groups\``,
    );
    await queryRunner.query(`DROP TABLE \`groups\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_12644270511e5e10c22110d30a\` ON \`credentials\``,
    );
    await queryRunner.query(`DROP TABLE \`credentials\``);
    await queryRunner.query(
      `DROP INDEX \`REL_77a9a771ebc3370f1af5273634\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_77a9a771ebc3370f1af5273634\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_52a29f8fc340e73d124af517f2\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_c2d13b5eb8cace20c9b2478375\` ON \`principals\``,
    );
    await queryRunner.query(`DROP TABLE \`principals\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_2310ecc5cb8be427097154b18f\` ON \`tenants\``,
    );
    await queryRunner.query(`DROP TABLE \`tenants\``);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_aces` and `file_aces` tables (RFC 3744 access
 * control entries), each with foreign keys to its parent resource and to
 * `principals`, and a `(<parent>_id, position)` index for the
 * evaluation-order query the ACL evaluation engine relies on.
 */
export class CreateAces1788279373465 implements MigrationInterface {
  name = 'CreateAces1788279373465';

  /** Applies the migration: creates the ACE tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."collection_aces_privilege_enum" AS ENUM('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."collection_aces_grant_deny_enum" AS ENUM('grant', 'deny')`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_aces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "collection_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "privilege" "public"."collection_aces_privilege_enum" NOT NULL, "grant_deny" "public"."collection_aces_grant_deny_enum" NOT NULL, "protected" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b8da4ed0c8c8b104b05fb2b3860" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3abf52a6631b5fc54e07d9b723" ON "collection_aces"  ("collection_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."file_aces_privilege_enum" AS ENUM('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."file_aces_grant_deny_enum" AS ENUM('grant', 'deny')`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_aces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "file_resource_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "privilege" "public"."file_aces_privilege_enum" NOT NULL, "grant_deny" "public"."file_aces_grant_deny_enum" NOT NULL, "protected" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5783571979e83095cbef3bec488" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c79662927b5ac586f3f8a3dd17" ON "file_aces"  ("file_resource_id", "position") `,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_aces" ADD CONSTRAINT "FK_af5769209aee6853ae7011138c1" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_aces" ADD CONSTRAINT "FK_b0777647b1b015e4305f5782b09" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_aces" ADD CONSTRAINT "FK_50c39db6813a50ea6a8df5bec97" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_aces" ADD CONSTRAINT "FK_ebb79d587328df2209f597a5097" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the ACE tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "file_aces" DROP CONSTRAINT "FK_ebb79d587328df2209f597a5097"`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_aces" DROP CONSTRAINT "FK_50c39db6813a50ea6a8df5bec97"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_aces" DROP CONSTRAINT "FK_b0777647b1b015e4305f5782b09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_aces" DROP CONSTRAINT "FK_af5769209aee6853ae7011138c1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c79662927b5ac586f3f8a3dd17"`,
    );
    await queryRunner.query(`DROP TABLE "file_aces"`);
    await queryRunner.query(`DROP TYPE "public"."file_aces_grant_deny_enum"`);
    await queryRunner.query(`DROP TYPE "public"."file_aces_privilege_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3abf52a6631b5fc54e07d9b723"`,
    );
    await queryRunner.query(`DROP TABLE "collection_aces"`);
    await queryRunner.query(
      `DROP TYPE "public"."collection_aces_grant_deny_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."collection_aces_privilege_enum"`,
    );
  }
}

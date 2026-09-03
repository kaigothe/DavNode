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
export class CreateAddressbookAcesLocksChanges1788463470422
  implements MigrationInterface
{
  name = 'CreateAddressbookAcesLocksChanges1788463470422';

  /** Applies the migration: creates the addressbook ACE/lock/change tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."address_object_aces_privilege_enum" AS ENUM('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."address_object_aces_grant_deny_enum" AS ENUM('grant', 'deny')`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_aces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "address_object_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "privilege" "public"."address_object_aces_privilege_enum" NOT NULL, "grant_deny" "public"."address_object_aces_grant_deny_enum" NOT NULL, "protected" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b713795886655792737b78d8e06" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cea5558e69223650915eaaaddb" ON "address_object_aces"  ("address_object_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."address_object_locks_scope_enum" AS ENUM('exclusive', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_object_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "address_object_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "token" character varying NOT NULL, "scope" "public"."address_object_locks_scope_enum" NOT NULL, "timeout_seconds" integer, "expires_at" TIMESTAMP, "owner_info" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e952f59029e8889ab3781c24f9b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_254bcdf1b251c770800bd6df00" ON "address_object_locks"  ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."addressbook_aces_privilege_enum" AS ENUM('read', 'write', 'write-properties', 'write-content', 'bind', 'unbind', 'unlock', 'read-acl', 'write-acl', 'read-current-user-privilege-set', 'all')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."addressbook_aces_grant_deny_enum" AS ENUM('grant', 'deny')`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_aces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "addressbook_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "privilege" "public"."addressbook_aces_privilege_enum" NOT NULL, "grant_deny" "public"."addressbook_aces_grant_deny_enum" NOT NULL, "protected" boolean NOT NULL DEFAULT false, "position" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0ff3679faa3f8922e199b0d3e9e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b49272b392aee3f6aa8152244" ON "addressbook_aces"  ("addressbook_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."addressbook_changes_action_enum" AS ENUM('added', 'modified', 'deleted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_changes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "addressbook_id" uuid NOT NULL, "seq" integer NOT NULL, "address_object_id" uuid, "action" "public"."addressbook_changes_action_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e5746af2382a11a03a7cf1c1ef7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_276a3f5a4492fd033867f68b11" ON "addressbook_changes"  ("addressbook_id", "seq") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."addressbook_locks_scope_enum" AS ENUM('exclusive', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."addressbook_locks_depth_enum" AS ENUM('zero', 'infinity')`,
    );
    await queryRunner.query(
      `CREATE TABLE "addressbook_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "addressbook_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "token" character varying NOT NULL, "scope" "public"."addressbook_locks_scope_enum" NOT NULL, "depth" "public"."addressbook_locks_depth_enum" NOT NULL, "timeout_seconds" integer, "expires_at" TIMESTAMP, "owner_info" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5d7d21ae15e1f565de3b446b163" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2aba142fc16c2de2453f0a2a87" ON "addressbook_locks"  ("token") `,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_aces" ADD CONSTRAINT "FK_58bf92e28b478c6534cf5b4bf0b" FOREIGN KEY ("address_object_id") REFERENCES "address_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_aces" ADD CONSTRAINT "FK_b8a7194ed4db62f4c1ec874d72a" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_locks" ADD CONSTRAINT "FK_caa2e72e6b5b67f465e5df6598f" FOREIGN KEY ("address_object_id") REFERENCES "address_objects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_locks" ADD CONSTRAINT "FK_e5a26600f217355768c3e161054" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_aces" ADD CONSTRAINT "FK_163408d6e9b1ffcaeff70a7f66d" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_aces" ADD CONSTRAINT "FK_c0286abf23a6997225d554626ec" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" ADD CONSTRAINT "FK_b2f635ae5860db28022e7647287" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_locks" ADD CONSTRAINT "FK_a5a7e6ff45ec59e71ebd88fa4c1" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_locks" ADD CONSTRAINT "FK_5f3ebcdd331c93c69997e0670b1" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the addressbook ACE/lock/change tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "addressbook_locks" DROP CONSTRAINT "FK_5f3ebcdd331c93c69997e0670b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_locks" DROP CONSTRAINT "FK_a5a7e6ff45ec59e71ebd88fa4c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" DROP CONSTRAINT "FK_b2f635ae5860db28022e7647287"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_aces" DROP CONSTRAINT "FK_c0286abf23a6997225d554626ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_aces" DROP CONSTRAINT "FK_163408d6e9b1ffcaeff70a7f66d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_locks" DROP CONSTRAINT "FK_e5a26600f217355768c3e161054"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_locks" DROP CONSTRAINT "FK_caa2e72e6b5b67f465e5df6598f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_aces" DROP CONSTRAINT "FK_b8a7194ed4db62f4c1ec874d72a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address_object_aces" DROP CONSTRAINT "FK_58bf92e28b478c6534cf5b4bf0b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2aba142fc16c2de2453f0a2a87"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_locks"`);
    await queryRunner.query(
      `DROP TYPE "public"."addressbook_locks_depth_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."addressbook_locks_scope_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_276a3f5a4492fd033867f68b11"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_changes"`);
    await queryRunner.query(
      `DROP TYPE "public"."addressbook_changes_action_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7b49272b392aee3f6aa8152244"`,
    );
    await queryRunner.query(`DROP TABLE "addressbook_aces"`);
    await queryRunner.query(
      `DROP TYPE "public"."addressbook_aces_grant_deny_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."addressbook_aces_privilege_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_254bcdf1b251c770800bd6df00"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_locks"`);
    await queryRunner.query(
      `DROP TYPE "public"."address_object_locks_scope_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cea5558e69223650915eaaaddb"`,
    );
    await queryRunner.query(`DROP TABLE "address_object_aces"`);
    await queryRunner.query(
      `DROP TYPE "public"."address_object_aces_grant_deny_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."address_object_aces_privilege_enum"`,
    );
  }
}

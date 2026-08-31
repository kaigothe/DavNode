import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the full M1 schema (`tenants`, `principals`, `users`,
 * `credentials`, `groups`, `group_memberships`) for Postgres in one
 * migration. Unlike `migrations/sqlite/`, which has one migration per
 * M1 sub-task, this is generated retroactively in one shot: Postgres
 * never ran an earlier version of the schema, so there's no real history
 * to split into separate steps. From here on, new migrations are
 * generated incrementally, in step with `migrations/sqlite/` and
 * `migrations/mysql/` — see `packages/core/README.md`.
 */
export class InitialSchema1788216474307 implements MigrationInterface {
  name = 'InitialSchema1788216474307';

  /** Applies the migration: creates the full M1 schema. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "name" character varying NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."principals_kind_enum" AS ENUM('user', 'group', 'special')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."principals_special_kind_enum" AS ENUM('authenticated', 'unauthenticated', 'all', 'owner', 'self')`,
    );
    await queryRunner.query(
      `CREATE TABLE "principals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "kind" "public"."principals_kind_enum" NOT NULL, "special_kind" "public"."principals_special_kind_enum", CONSTRAINT "PK_58c7b420eb803e39d754963719c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2d13b5eb8cace20c9b2478375" ON "principals"  ("tenant_id", "kind") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('member', 'tenant_admin', 'server_admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "principal_id" uuid NOT NULL, "tenant_id" uuid NOT NULL, "username" character varying NOT NULL, "email" character varying NOT NULL, "quota_limit_bytes" bigint, "quota_used_bytes" bigint NOT NULL DEFAULT '0', "role" "public"."users_role_enum" NOT NULL DEFAULT 'member', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_77a9a771ebc3370f1af52736343" UNIQUE ("principal_id"), CONSTRAINT "REL_77a9a771ebc3370f1af5273634" UNIQUE ("principal_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52a29f8fc340e73d124af517f2" ON "users"  ("tenant_id", "username") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."credentials_type_enum" AS ENUM('basic')`,
    );
    await queryRunner.query(
      `CREATE TABLE "credentials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" "public"."credentials_type_enum" NOT NULL, "password_hash" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1e38bc43be6697cdda548ad27a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_12644270511e5e10c22110d30a" ON "credentials"  ("user_id", "type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "principal_id" uuid NOT NULL, "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"), CONSTRAINT "REL_49c3ac49d10e25bf2434234fcb" UNIQUE ("principal_id"), CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups"  ("tenant_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "group_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "group_id" uuid NOT NULL, "member_principal_id" uuid NOT NULL, CONSTRAINT "PK_4a04ebe9f25ad41f45b2c0ca4b5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships"  ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "principals" ADD CONSTRAINT "FK_f0e7950772e6b6aca9c6f78a525" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_77a9a771ebc3370f1af52736343" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" ADD CONSTRAINT "FK_49c3ac49d10e25bf2434234fcbe" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" ADD CONSTRAINT "FK_245f58bdfb3e9529b4100d9c5e7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_memberships" ADD CONSTRAINT "FK_cad344fe877fcee0ac7e065ed05" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_memberships" ADD CONSTRAINT "FK_0e588f4e5fa5ddd066e35521540" FOREIGN KEY ("member_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the full M1 schema. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "group_memberships" DROP CONSTRAINT "FK_0e588f4e5fa5ddd066e35521540"`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_memberships" DROP CONSTRAINT "FK_cad344fe877fcee0ac7e065ed05"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" DROP CONSTRAINT "FK_245f58bdfb3e9529b4100d9c5e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" DROP CONSTRAINT "FK_49c3ac49d10e25bf2434234fcbe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credentials" DROP CONSTRAINT "FK_c68a6c53e95a7dc357f4ebce8f0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_109638590074998bb72a2f2cf08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_77a9a771ebc3370f1af52736343"`,
    );
    await queryRunner.query(
      `ALTER TABLE "principals" DROP CONSTRAINT "FK_f0e7950772e6b6aca9c6f78a525"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c8d5d2c5811193f02f82307e46"`,
    );
    await queryRunner.query(`DROP TABLE "group_memberships"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5a92873f80fa97cf9e687c77b8"`,
    );
    await queryRunner.query(`DROP TABLE "groups"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_12644270511e5e10c22110d30a"`,
    );
    await queryRunner.query(`DROP TABLE "credentials"`);
    await queryRunner.query(`DROP TYPE "public"."credentials_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_52a29f8fc340e73d124af517f2"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c2d13b5eb8cace20c9b2478375"`,
    );
    await queryRunner.query(`DROP TABLE "principals"`);
    await queryRunner.query(
      `DROP TYPE "public"."principals_special_kind_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."principals_kind_enum"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}

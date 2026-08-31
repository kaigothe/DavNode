import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `groups` table (with its unique foreign key to `principals`,
 * a foreign key to `tenants`, and a `(tenant_id, name)` unique index) and
 * the `group_memberships` table (with foreign keys to `groups` and
 * `principals`, and a `(group_id, member_principal_id)` unique index).
 */
export class CreateGroups1788212097336 implements MigrationInterface {
  name = 'CreateGroups1788212097336';

  /** Applies the migration: creates the `groups` and `group_memberships` tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"), CONSTRAINT "REL_49c3ac49d10e25bf2434234fcb" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"), CONSTRAINT "REL_49c3ac49d10e25bf2434234fcb" UNIQUE ("principal_id"), CONSTRAINT "FK_49c3ac49d10e25bf2434234fcbe" FOREIGN KEY ("principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_245f58bdfb3e9529b4100d9c5e7" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_groups"("id", "principal_id", "tenant_id", "name", "description") SELECT "id", "principal_id", "tenant_id", "name", "description" FROM "groups"`,
    );
    await queryRunner.query(`DROP TABLE "groups"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_groups" RENAME TO "groups"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL, CONSTRAINT "FK_cad344fe877fcee0ac7e065ed05" FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0e588f4e5fa5ddd066e35521540" FOREIGN KEY ("member_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_group_memberships"("id", "group_id", "member_principal_id") SELECT "id", "group_id", "member_principal_id" FROM "group_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "group_memberships"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_group_memberships" RENAME TO "group_memberships"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
  }

  /** Reverts the migration: drops the `group_memberships` and `groups` tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(
      `ALTER TABLE "group_memberships" RENAME TO "temporary_group_memberships"`,
    );
    await queryRunner.query(
      `CREATE TABLE "group_memberships" ("id" varchar PRIMARY KEY NOT NULL, "group_id" varchar NOT NULL, "member_principal_id" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "group_memberships"("id", "group_id", "member_principal_id") SELECT "id", "group_id", "member_principal_id" FROM "temporary_group_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_group_memberships"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c8d5d2c5811193f02f82307e46" ON "group_memberships" ("group_id", "member_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(
      `ALTER TABLE "groups" RENAME TO "temporary_groups"`,
    );
    await queryRunner.query(
      `CREATE TABLE "groups" ("id" varchar PRIMARY KEY NOT NULL, "principal_id" varchar NOT NULL, "tenant_id" varchar NOT NULL, "name" varchar NOT NULL, "description" varchar, CONSTRAINT "UQ_49c3ac49d10e25bf2434234fcbe" UNIQUE ("principal_id"), CONSTRAINT "REL_49c3ac49d10e25bf2434234fcb" UNIQUE ("principal_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "groups"("id", "principal_id", "tenant_id", "name", "description") SELECT "id", "principal_id", "tenant_id", "name", "description" FROM "temporary_groups"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_groups"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5a92873f80fa97cf9e687c77b8" ON "groups" ("tenant_id", "name") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_c8d5d2c5811193f02f82307e46"`);
    await queryRunner.query(`DROP TABLE "group_memberships"`);
    await queryRunner.query(`DROP INDEX "IDX_5a92873f80fa97cf9e687c77b8"`);
    await queryRunner.query(`DROP TABLE "groups"`);
  }
}

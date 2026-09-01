import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `collection_locks` and `file_locks` tables (RFC 4918 §7–9
 * WebDAV locks), each with foreign keys to its parent resource and to
 * `principals`, and a unique index on `token` (global lookup for UNLOCK
 * and `If`-header validation).
 */
export class CreateLocks1788292031966 implements MigrationInterface {
  name = 'CreateLocks1788292031966';

  /** Applies the migration: creates the lock tables. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."collection_locks_scope_enum" AS ENUM('exclusive', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."collection_locks_depth_enum" AS ENUM('zero', 'infinity')`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "collection_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "token" character varying NOT NULL, "scope" "public"."collection_locks_scope_enum" NOT NULL, "depth" "public"."collection_locks_depth_enum" NOT NULL, "timeout_seconds" integer, "expires_at" TIMESTAMP, "owner_info" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_093ffe451faa27bb86eb721d002" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e4ae75a7ea5ad17f7a06d207c" ON "collection_locks"  ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."file_locks_scope_enum" AS ENUM('exclusive', 'shared')`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_locks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "file_resource_id" uuid NOT NULL, "principal_id" uuid NOT NULL, "token" character varying NOT NULL, "scope" "public"."file_locks_scope_enum" NOT NULL, "timeout_seconds" integer, "expires_at" TIMESTAMP, "owner_info" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7606770635fbe3d6a1c3abe66e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b6ffd73906276f27b80fc450e" ON "file_locks"  ("token") `,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_locks" ADD CONSTRAINT "FK_52fa819b7afe6c73b9ac90ff8c7" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_locks" ADD CONSTRAINT "FK_b687c1bbac285cec3a98cf3efee" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_locks" ADD CONSTRAINT "FK_dd3be5955135ee49f14388907c1" FOREIGN KEY ("file_resource_id") REFERENCES "file_resources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_locks" ADD CONSTRAINT "FK_f54427bf1772f846bdbeddc7e55" FOREIGN KEY ("principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the lock tables. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "file_locks" DROP CONSTRAINT "FK_f54427bf1772f846bdbeddc7e55"`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_locks" DROP CONSTRAINT "FK_dd3be5955135ee49f14388907c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_locks" DROP CONSTRAINT "FK_b687c1bbac285cec3a98cf3efee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_locks" DROP CONSTRAINT "FK_52fa819b7afe6c73b9ac90ff8c7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8b6ffd73906276f27b80fc450e"`,
    );
    await queryRunner.query(`DROP TABLE "file_locks"`);
    await queryRunner.query(`DROP TYPE "public"."file_locks_scope_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4e4ae75a7ea5ad17f7a06d207c"`,
    );
    await queryRunner.query(`DROP TABLE "collection_locks"`);
    await queryRunner.query(`DROP TYPE "public"."collection_locks_depth_enum"`);
    await queryRunner.query(`DROP TYPE "public"."collection_locks_scope_enum"`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `scheduling_inbox_items` (RFC 6638 §2.2 implicit scheduling,
 * M7): one row per delivered iTIP message, `method` restricted to
 * `REQUEST`/`REPLY`/`CANCEL`, an index on `uid` for reply-merge
 * correlation and one on `(tenant_id, owner_principal_id)` for listing a
 * user's own inbox. No unique constraint on `uid` — several items may
 * share one, an append-only log rather than a single current-state row
 * per event. Deliberately no ACE/lock/change-log table set: access is
 * always just "matches `owner_principal_id`", no RFC 3744 sharing.
 */
export class CreateSchedulingInboxItems1790317035556 implements MigrationInterface {
  name = 'CreateSchedulingInboxItems1790317035556';

  /** Applies the migration: creates the `scheduling_inbox_items` table, its enum, indexes and foreign keys. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."scheduling_inbox_items_method_enum" AS ENUM('REQUEST', 'REPLY', 'CANCEL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "scheduling_inbox_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "owner_principal_id" uuid NOT NULL, "ics_data" text NOT NULL, "method" "public"."scheduling_inbox_items_method_enum" NOT NULL, "uid" character varying NOT NULL, "etag" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_52fb4a9a656af4640b39547a281" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items"  ("uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items"  ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" ADD CONSTRAINT "FK_7f22de768bcfd46beca3612d35f" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" ADD CONSTRAINT "FK_792cbbc25cb08b59cddc34e9a52" FOREIGN KEY ("owner_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops `scheduling_inbox_items` and its enum. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" DROP CONSTRAINT "FK_792cbbc25cb08b59cddc34e9a52"`,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" DROP CONSTRAINT "FK_7f22de768bcfd46beca3612d35f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_590f46542b735f1f74c3ff798b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_80b1f8a06fdf44be017127d590"`,
    );
    await queryRunner.query(`DROP TABLE "scheduling_inbox_items"`);
    await queryRunner.query(
      `DROP TYPE "public"."scheduling_inbox_items_method_enum"`,
    );
  }
}

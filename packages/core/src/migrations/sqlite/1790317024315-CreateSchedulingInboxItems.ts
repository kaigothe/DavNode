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
export class CreateSchedulingInboxItems1790317024315 implements MigrationInterface {
  name = 'CreateSchedulingInboxItems1790317024315';

  /** Applies the migration: creates the `scheduling_inbox_items` table and its indexes/foreign keys. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_7f22de768bcfd46beca3612d35f" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_792cbbc25cb08b59cddc34e9a52" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_scheduling_inbox_items"("id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at") SELECT "id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at" FROM "scheduling_inbox_items"`,
    );
    await queryRunner.query(`DROP TABLE "scheduling_inbox_items"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_scheduling_inbox_items" RENAME TO "scheduling_inbox_items"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
  }

  /** Reverts the migration: drops `scheduling_inbox_items`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(
      `ALTER TABLE "scheduling_inbox_items" RENAME TO "temporary_scheduling_inbox_items"`,
    );
    await queryRunner.query(
      `CREATE TABLE "scheduling_inbox_items" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "ics_data" text NOT NULL, "method" varchar CHECK( "method" IN ('REQUEST','REPLY','CANCEL') ) NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "scheduling_inbox_items"("id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at") SELECT "id", "tenant_id", "owner_principal_id", "ics_data", "method", "uid", "etag", "created_at" FROM "temporary_scheduling_inbox_items"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_scheduling_inbox_items"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_590f46542b735f1f74c3ff798b" ON "scheduling_inbox_items" ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80b1f8a06fdf44be017127d590" ON "scheduling_inbox_items" ("uid") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_590f46542b735f1f74c3ff798b"`);
    await queryRunner.query(`DROP INDEX "IDX_80b1f8a06fdf44be017127d590"`);
    await queryRunner.query(`DROP TABLE "scheduling_inbox_items"`);
  }
}

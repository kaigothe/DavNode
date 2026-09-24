import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `calendars` table, its foreign keys to `tenants` and `principals`,
 * its `(tenant_id, owner_principal_id)` index and the unique index on
 * `ics_feed_token` (nullable — many calendars may have no feed token yet).
 * Unlike `collections`, there is no unique index on `(tenant_id)`: a principal
 * may own more than one calendar.
 */
export class CreateCalendars1790246703999 implements MigrationInterface {
  name = 'CreateCalendars1790246703999';

  /** Applies the migration: creates the `calendars` table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendars" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "owner_principal_id" uuid NOT NULL, "display_name" character varying NOT NULL, "description" text, "supported_component_set" character varying NOT NULL DEFAULT 'VEVENT', "timezone" text, "ics_feed_token" character varying, "sync_seq" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_90dc0330e8ec9028e23c290dee8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_849cdd27db4994598fccaef51a" ON "calendars"  ("ics_feed_token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e0cde2775ff6908032a8fd7d4" ON "calendars"  ("tenant_id", "owner_principal_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "calendars" ADD CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendars" ADD CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31" FOREIGN KEY ("owner_principal_id") REFERENCES "principals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Reverts the migration: drops the `calendars` table. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calendars" DROP CONSTRAINT "FK_e7a60821a6568f5551eb19ddf31"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendars" DROP CONSTRAINT "FK_c6809561e0dc82e7ad5b8493e0f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e0cde2775ff6908032a8fd7d4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_849cdd27db4994598fccaef51a"`,
    );
    await queryRunner.query(`DROP TABLE "calendars"`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `address_objects.name` (the resource's own URL path segment,
 * mirroring `FileResource.name`), replaces the old unique
 * `(addressbook_id, uid)` index with a non-unique one (kept for lookup
 * performance — `uid` uniqueness is now enforced at the application
 * level, since the same `uid` legitimately keeps its row across an
 * update at its own unchanged `name`), and adds a new unique
 * `(addressbook_id, name)` index — the URL identity PUT/GET/DELETE
 * resolve by. See the `AddressObject` entity's doc comment for the full
 * rationale; this retrofits Große Aufgabe 1's original entity, which
 * had only `uid`.
 */
export class AddAddressObjectName1788468565224 implements MigrationInterface {
  name = 'AddAddressObjectName1788468565224';

  /** Applies the migration: adds `name`, swaps the `uid` index for a non-unique one, adds the unique `name` index. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar NOT NULL, CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_941fdab999183be409b8482cc30" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at" FROM "address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "address_objects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_address_objects" RENAME TO "address_objects"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dfaabb97b6de005a6aa87ddd70" ON "address_objects" ("addressbook_id", "name") `,
    );
  }

  /** Reverts the migration: drops `name` and the two index changes, restoring the original unique `(addressbook_id, uid)` index. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dfaabb97b6de005a6aa87ddd70"`);
    await queryRunner.query(`DROP INDEX "IDX_ed512269f98f4f1532c0e26330"`);
    await queryRunner.query(
      `ALTER TABLE "address_objects" RENAME TO "temporary_address_objects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "address_objects" ("id" varchar PRIMARY KEY NOT NULL, "tenant_id" varchar NOT NULL, "addressbook_id" varchar NOT NULL, "uid" varchar NOT NULL, "etag" varchar NOT NULL, "owner_principal_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1f9ca4955716807c430cb94c3a8" FOREIGN KEY ("owner_principal_id") REFERENCES "principals" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_cac47f6d742edc4c26aabe7d5c6" FOREIGN KEY ("addressbook_id") REFERENCES "addressbooks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_941fdab999183be409b8482cc30" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "address_objects"("id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at") SELECT "id", "tenant_id", "addressbook_id", "uid", "etag", "owner_principal_id", "created_at", "updated_at" FROM "temporary_address_objects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_address_objects"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed512269f98f4f1532c0e26330" ON "address_objects" ("addressbook_id", "uid") `,
    );
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames `addressbook_changes.address_object_id` to `name` (retyped
 * `uuid` → `character varying`, and non-nullable): the changed
 * `AddressObject`'s own path segment (`AddressObject.name`, added
 * alongside this migration) is what `sync-collection` needs to report a
 * deletion's href, not its id, which is useless once the row is gone.
 * See the `AddressbookChange` entity's doc comment for the full
 * rationale — this retrofits Große Aufgabe 1's original column, written
 * before `AddressObject` had a separate name to denormalize.
 *
 * Hand-written rather than using `typeorm migration:generate`'s own
 * output verbatim: it produced a rename immediately followed by a drop
 * and a fresh (empty) `name` column — technically valid SQL, but
 * needlessly data-destroying for a same-shape column swap. This
 * version instead retypes and renames the existing column in place, so
 * any existing values survive (cast to text) rather than being
 * silently discarded.
 */
export class RenameAddressbookChangeToName1788469164619
  implements MigrationInterface
{
  name = 'RenameAddressbookChangeToName1788469164619';

  /** Applies the migration: retypes `address_object_id` to `character varying` NOT NULL, then renames it to `name`. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" ALTER COLUMN "address_object_id" TYPE character varying USING "address_object_id"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" ALTER COLUMN "address_object_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME COLUMN "address_object_id" TO "name"`,
    );
  }

  /**
   * Reverts the migration: renames `name` back to `address_object_id`
   * and retypes it to nullable `uuid`. Only valid while every `name`
   * value is still a well-formed UUID string (true immediately after
   * `up()`, since nothing has written a real path segment yet at this
   * point in the schema's history) — not a general-purpose downgrade
   * path once real `AddressObject` names exist.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" RENAME COLUMN "name" TO "address_object_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" ALTER COLUMN "address_object_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "addressbook_changes" ALTER COLUMN "address_object_id" TYPE uuid USING "address_object_id"::uuid`,
    );
  }
}

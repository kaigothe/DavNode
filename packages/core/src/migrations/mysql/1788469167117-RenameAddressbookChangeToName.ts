import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames `addressbook_changes.address_object_id` to `name` (and drops
 * its nullability): the changed `AddressObject`'s own path segment
 * (`AddressObject.name`, added alongside this migration) is what
 * `sync-collection` needs to report a deletion's href, not its id,
 * which is useless once the row is gone. See the `AddressbookChange`
 * entity's doc comment for the full rationale — this retrofits Große
 * Aufgabe 1's original column, written before `AddressObject` had a
 * separate name to denormalize.
 *
 * Hand-written rather than using `typeorm migration:generate`'s own
 * output verbatim: it produced a rename immediately followed by a drop
 * and a fresh (empty) `name` column — technically valid SQL, but
 * needlessly data-destroying for a same-shape column swap (both columns
 * are `varchar(255)` already, so a single `CHANGE` does the whole job).
 */
export class RenameAddressbookChangeToName1788469167117
  implements MigrationInterface
{
  name = 'RenameAddressbookChangeToName1788469167117';

  /** Applies the migration: renames `address_object_id` to `name`, non-nullable, in one `CHANGE`. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` CHANGE \`address_object_id\` \`name\` varchar(255) NOT NULL`,
    );
  }

  /** Reverts the migration: renames `name` back to nullable `address_object_id`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`addressbook_changes\` CHANGE \`name\` \`address_object_id\` varchar(255) NULL`,
    );
  }
}

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
export class AddAddressObjectName1788468675143 implements MigrationInterface {
  name = 'AddAddressObjectName1788468675143';

  /**
   * Applies the migration: adds `name`, swaps the `uid` index for a
   * non-unique one, adds the unique `name` index.
   *
   * Ordered so `address_objects_ibfk_*`'s foreign key on `addressbook_id`
   * always has a covering index to fall back on: InnoDB refuses to drop
   * whichever index it's currently using to support that constraint
   * (`ER_DROP_INDEX_FK`), so the new `(addressbook_id, name)` index —
   * itself `addressbook_id`-leading — is created *before* the old
   * `(addressbook_id, uid)` one is dropped, not after.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` ADD \`name\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_dfaabb97b6de005a6aa87ddd70\` ON \`address_objects\` (\`addressbook_id\`, \`name\`)`,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ed512269f98f4f1532c0e26330\` ON \`address_objects\``,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_ed512269f98f4f1532c0e26330\` ON \`address_objects\` (\`addressbook_id\`, \`uid\`)`,
    );
  }

  /**
   * Reverts the migration: drops `name` and the two index changes,
   * restoring the original unique `(addressbook_id, uid)` index — same
   * FK-covering-index ordering constraint as `up()`, mirrored in reverse.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_ed512269f98f4f1532c0e26330\` ON \`address_objects\``,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_ed512269f98f4f1532c0e26330\` ON \`address_objects\` (\`addressbook_id\`, \`uid\`)`,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_dfaabb97b6de005a6aa87ddd70\` ON \`address_objects\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`address_objects\` DROP COLUMN \`name\``,
    );
  }
}

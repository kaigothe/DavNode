import type { EntityManager } from 'typeorm';
import { AddressObjectIndex } from '../entities/address-object-index.entity.js';
import type { ParsedVCard } from './vcard-parser.js';

/**
 * The vCard properties indexed into {@link AddressObjectIndex} rows,
 * paired with the {@link ParsedVCard} field each one reads from.
 * Extending the indexed set later (e.g. adding `ADR`) only means adding
 * an entry here — see the entity's own doc comment for why
 * `propertyName` isn't a database-level enum.
 */
const INDEXED_PROPERTIES: ReadonlyArray<{
  propertyName: string;
  values: (parsed: ParsedVCard) => readonly string[];
}> = [
  { propertyName: 'FN', values: (parsed) => parsed.fn },
  { propertyName: 'N', values: (parsed) => parsed.n },
  { propertyName: 'EMAIL', values: (parsed) => parsed.email },
  { propertyName: 'TEL', values: (parsed) => parsed.tel },
  { propertyName: 'ORG', values: (parsed) => parsed.org },
  { propertyName: 'NICKNAME', values: (parsed) => parsed.nickname },
];

/**
 * The vCard property names that have {@link AddressObjectIndex} rows —
 * exactly the properties `addressbook-query` can filter on. Derived from
 * `INDEXED_PROPERTIES`, so extending the index extends what the
 * query report accepts, with no second list to keep in step.
 */
export const INDEXED_PROPERTY_NAMES: readonly string[] = INDEXED_PROPERTIES.map(
  ({ propertyName }) => propertyName,
);

/**
 * Normalizes a vCard property value (or a query's search text) for
 * comparison against {@link AddressObjectIndex.propertyValue}: trimmed
 * and lowercased. Shared by the writer ({@link indexVCard}) and the
 * reader (`addressbook-query`), so both sides of a comparison are
 * normalized identically — the case-insensitivity of the
 * `i;unicode-casemap` collation lives in this one function.
 */
export function normalizeIndexValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Replaces an `AddressObject`'s {@link AddressObjectIndex} rows with
 * freshly parsed values from its vCard content — one row per property
 * occurrence (e.g. two `EMAIL` addresses produce two rows), so a future
 * `addressbook-query` filter (Große Aufgabe 6) can search without
 * loading and re-parsing the raw vCard blob.
 *
 * Deletes the `AddressObject`'s existing index rows before inserting
 * the new ones, so a PUT that updates a contact never leaves stale
 * index entries behind. Takes the caller's own `EntityManager` rather
 * than opening its own transaction — the index rows and the vCard
 * content they're derived from must commit or roll back together (see
 * `CollectionChangeService` for the same rationale in the WebDAV
 * domain).
 *
 * @param manager - The same `EntityManager` the caller's own write of
 * `AddressObjectContent` is using, so both commit or roll back together.
 * @param addressObjectId - The `AddressObject` these index rows belong to.
 * @param parsedVCard - The vCard content already parsed via `parseVCard`.
 */
export async function indexVCard(
  manager: EntityManager,
  addressObjectId: string,
  parsedVCard: ParsedVCard,
): Promise<void> {
  const repository = manager.getRepository(AddressObjectIndex);
  await repository.delete({ addressObjectId });

  const rows = INDEXED_PROPERTIES.flatMap(({ propertyName, values }) =>
    values(parsedVCard).map((value) =>
      repository.create({
        addressObjectId,
        propertyName,
        propertyValue: normalizeIndexValue(value),
      }),
    ),
  );

  if (rows.length > 0) {
    await repository.save(rows);
  }
}

import vCard from 'vcf';

/**
 * A vCard's extracted, library-independent fields — the only shape the
 * rest of `@davnode/core` depends on. Insulates callers from `vcf` (the
 * underlying parsing library): a future library swap only has to update
 * this file, not every consumer.
 *
 * Every field except `version` and `uid` is an array because RFC 6350
 * allows each of these properties to occur more than once on a single
 * vCard (e.g. two `EMAIL` lines for work/home addresses) — array even
 * for a property that's realistically single-valued (`N`) keeps
 * `indexVCard` (`index-vcard.ts`) from needing per-field special
 * casing: one row per array entry, uniformly.
 */
export interface ParsedVCard {
  /** The vCard format version as declared by the `VERSION` property (e.g. `'3.0'`, `'4.0'`). */
  version: string;

  /** The `UID` property — CardDAV's object identity (RFC 6352 §5.1). Always present; {@link parseVCard} rejects a vCard without one. */
  uid: string;

  /** `FN` (formatted name) occurrences. */
  fn: string[];

  /** `N` (structured name) occurrences, each the raw semicolon-separated component string. */
  n: string[];

  /** `EMAIL` occurrences. */
  email: string[];

  /** `TEL` occurrences. */
  tel: string[];

  /** `ORG` (organization) occurrences. */
  org: string[];

  /** `NICKNAME` occurrences. */
  nickname: string[];
}

/**
 * Thrown when vCard text can't be turned into a {@link ParsedVCard} —
 * either the underlying library rejects it outright (not recognizable
 * vCard syntax at all) or it parses but is missing the `UID` property
 * CardDAV requires for object identity. Callers (the PUT handler, see
 * milestones/M5-carddav/04-address-object-crud) map this to a `400`
 * response.
 */
export class VCardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VCardParseError';
  }
}

/**
 * Normalizes a `vcf` property field into a plain string array. `vcf`
 * represents an absent property as `undefined`, a single occurrence as
 * a bare `Property`, and multiple occurrences as `Property[]` — this
 * collapses all three into one consistent shape.
 */
function toStringArray(
  field: vCard.Property | vCard.Property[] | undefined,
): string[] {
  if (field === undefined) {
    return [];
  }
  return Array.isArray(field)
    ? field.map((property) => property.valueOf())
    : [field.valueOf()];
}

/**
 * Parses raw vCard text (vCard 3.0 or 4.0 — RFC 2426 / RFC 6350) into a
 * {@link ParsedVCard}. Throws {@link VCardParseError} for input that
 * either isn't recognizable as vCard syntax at all, or is missing the
 * `UID` property CardDAV requires (RFC 6352 §5.1) — never lets the
 * underlying library's own exception type, or a raw parser crash,
 * escape to the caller.
 *
 * Only rough compatibility across both vCard versions is attempted, per
 * M5's scope (see milestones/M5-carddav/00-setting-goal.md) — full
 * 3.0/4.0 semantic reconciliation (e.g. differing `TYPE` parameter
 * conventions) is M11's job.
 *
 * @param raw - The raw vCard text (a single `BEGIN:VCARD`…`END:VCARD` block).
 * @returns The parsed, library-independent representation.
 */
export function parseVCard(raw: string): ParsedVCard {
  let card: vCard;
  try {
    card = new vCard().parse(raw);
  } catch (error) {
    throw new VCardParseError(
      `Could not parse vCard: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const uid = toStringArray(card.data.uid)[0];
  if (!uid) {
    throw new VCardParseError('vCard is missing the required UID property');
  }

  return {
    version: card.version,
    uid,
    fn: toStringArray(card.data.fn),
    n: toStringArray(card.data.n),
    email: toStringArray(card.data.email),
    tel: toStringArray(card.data.tel),
    org: toStringArray(card.data.org),
    nickname: toStringArray(card.data.nickname),
  };
}

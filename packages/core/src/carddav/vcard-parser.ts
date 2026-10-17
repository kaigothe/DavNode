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

  /** `NOTE` occurrences. */
  note: string[];

  /** `ADR` (address) occurrences, each the raw semicolon-separated component string. */
  adr: string[];

  /** `TITLE` occurrences. */
  title: string[];

  /** `ROLE` occurrences. */
  role: string[];

  /** `URL` occurrences. */
  url: string[];

  /** `BDAY` occurrences. */
  bday: string[];

  /** `CATEGORIES` occurrences. */
  categories: string[];

  /** One entry per `PHOTO` occurrence — an empty string, as the image data itself is never indexed (only its presence is searchable). */
  photo: string[];

  /**
   * Every occurrence of the indexed properties with its `TYPE`
   * parameter normalized, in document order — the one representation
   * vCard 3.0's `TYPE=HOME;TYPE=VOICE` and 4.0's `TYPE="home,voice"`
   * (and the unquoted `TYPE=HOME,VOICE`) all collapse into: `types` is
   * lowercase, de-duplicated and never contains a comma.
   */
  typed: ParsedVCardProperty[];
}

/** One indexed vCard property occurrence, see {@link ParsedVCard.typed}. */
export interface ParsedVCardProperty {
  /** Upper-case property name, e.g. `'TEL'`. */
  name: string;
  /** The decoded value (quoted-printable resolved). */
  value: string;
  /** Normalized `TYPE` values, e.g. `['home', 'voice']`; empty when the property has no `TYPE`. */
  types: string[];
}

/** vCard versions DavNode accepts (RFC 6352 §6.2.2 requires 3.0 and 4.0). */
const SUPPORTED_VERSIONS = ['3.0', '4.0'];

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
 * Joins quoted-printable "soft line breaks": a property line declaring
 * `ENCODING=QUOTED-PRINTABLE` whose text ends in `=` continues on the
 * next physical line (older exporters wrap long values this way, without
 * the leading whitespace of ordinary vCard folding, which `vcf` would
 * not understand).
 */
function joinQuotedPrintableSoftBreaks(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i] ?? '';
    const colon = line.indexOf(':');
    if (colon !== -1 && isQuotedPrintableDeclaration(line.slice(0, colon))) {
      while (line.endsWith('=') && i + 1 < lines.length) {
        i += 1;
        line = line.slice(0, -1) + (lines[i] ?? '');
      }
    }
    out.push(line);
  }
  return out.join('\r\n');
}

/** Whether a property's name-and-parameters part declares quoted-printable (`ENCODING=QUOTED-PRINTABLE`; vCard 2.1's bare token is not supported, 2.1 being rejected as a whole). */
function isQuotedPrintableDeclaration(header: string): boolean {
  return /;\s*encoding\s*=\s*(?:quoted-printable|q)\s*(?:;|$)/i.test(header);
}

/**
 * Decodes quoted-printable text (RFC 2045 §6.7) in `charset`. Literal
 * characters are taken as their UTF-8 bytes (the vCard text itself has
 * already been decoded), `=XX` is one raw byte, and a stray `=` that is
 * not followed by two hex digits stays as it is. An unknown `charset`
 * falls back to UTF-8.
 */
export function decodeQuotedPrintable(text: string, charset = 'utf-8'): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < text.length) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === '=' && /^[0-9a-fA-F]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 3;
      continue;
    }
    const codePoint = text.codePointAt(i) ?? 0;
    bytes.push(...Buffer.from(String.fromCodePoint(codePoint)));
    i += codePoint > 0xffff ? 2 : 1;
  }
  const data = Uint8Array.from(bytes);
  try {
    return new TextDecoder(charset).decode(data);
  } catch {
    return new TextDecoder('utf-8').decode(data);
  }
}

/**
 * Splits a structured value (`N`, `ORG`) at unescaped semicolons so each
 * component can be decoded on its own: an encoded `=3B` is a literal
 * semicolon inside a component, a bare `;` separates components.
 */
function decodeQuotedPrintableValue(value: string, charset: string): string {
  return value
    .split(/(?<!\\);/)
    .map((component) =>
      decodeQuotedPrintable(component, charset).replace(/;/g, '\\;'),
    )
    .join(';');
}

/** Normalizes a `vcf` property's `TYPE` parameter, whichever syntax it came in. */
function normalizeTypes(property: vCard.Property): string[] {
  const raw = (property as unknown as { type?: unknown }).type;
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const types = values
    .flatMap((value) => String(value).split(','))
    .map((value) => value.replace(/^"|"$/g, '').trim().toLowerCase())
    .filter((value) => value !== '');
  return [...new Set(types)];
}

/** The decoded text of one `vcf` property. */
function propertyText(property: vCard.Property): string {
  const value = property.valueOf();
  const params = property as unknown as {
    encoding?: unknown;
    charset?: unknown;
  };
  const encoding = typeof params.encoding === 'string' ? params.encoding : '';
  if (!/^(?:quoted-printable|q)$/i.test(encoding)) {
    return value;
  }
  return decodeQuotedPrintableValue(
    value,
    typeof params.charset === 'string' ? params.charset : 'utf-8',
  );
}

/**
 * Normalizes a `vcf` property field into its occurrences. `vcf`
 * represents an absent property as `undefined`, a single occurrence as a
 * bare `Property`, and multiple occurrences as `Property[]`.
 */
function toProperties(
  field: vCard.Property | vCard.Property[] | undefined,
): vCard.Property[] {
  if (field === undefined) {
    return [];
  }
  return Array.isArray(field) ? field : [field];
}

const toStringArray = (
  field: vCard.Property | vCard.Property[] | undefined,
): string[] => toProperties(field).map(propertyText);

/**
 * Parses raw vCard text (vCard 3.0 or 4.0 — RFC 2426 / RFC 6350) into a
 * {@link ParsedVCard}. Throws {@link VCardParseError} for input that
 * either isn't recognizable as vCard syntax at all, or is missing the
 * `UID` property CardDAV requires (RFC 6352 §5.1) — never lets the
 * underlying library's own exception type, or a raw parser crash,
 * escape to the caller.
 *
 * Version 3.0 and 4.0 are accepted (RFC 6352 §6.2.2); any other or
 * missing `VERSION` is rejected rather than half-understood. The
 * differences that matter in practice are reconciled here (M11):
 * `ENCODING=QUOTED-PRINTABLE` values — which 4.0 dropped but older
 * clients still send — are decoded (with their `CHARSET`, and including
 * soft line breaks) before they reach the search index, and the three
 * spellings of the `TYPE` parameter collapse into one list, see
 * {@link ParsedVCard.typed}. Properties DavNode does not index, such as
 * Apple's `X-ABADR`, are simply not looked at: the stored text is the
 * client's original, so they survive a GET untouched.
 *
 * @param raw - The raw vCard text (a single `BEGIN:VCARD`…`END:VCARD` block).
 * @returns The parsed, library-independent representation.
 */
export function parseVCard(raw: string): ParsedVCard {
  let card: vCard;
  try {
    card = new vCard().parse(joinQuotedPrintableSoftBreaks(raw));
  } catch (error) {
    throw new VCardParseError(
      `Could not parse vCard: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!SUPPORTED_VERSIONS.includes(card.version)) {
    throw new VCardParseError(
      `Unsupported vCard version "${String(card.version)}"; expected 3.0 or 4.0`,
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
    note: toStringArray(card.data.note),
    adr: toStringArray(card.data.adr),
    title: toStringArray(card.data.title),
    role: toStringArray(card.data.role),
    url: toStringArray(card.data.url),
    bday: toStringArray(card.data.bday),
    categories: toStringArray(card.data.categories),
    photo: toProperties(card.data.photo).map(() => ''),
    typed: (['fn', 'n', 'email', 'tel', 'org', 'nickname'] as const).flatMap(
      (field) =>
        toProperties(card.data[field]).map((property) => ({
          name: field.toUpperCase(),
          value: propertyText(property),
          types: normalizeTypes(property),
        })),
    ),
  };
}

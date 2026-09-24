/** One `<C:prop name="..." novalue="...">` entry of a `CARDDAV:address-data` request (RFC 6352 §10.4.2). */
export interface VCardPropertySelector {
  /** The vCard property to return, optionally group-prefixed (`TEL` or `X-ABC.TEL`), matched case-insensitively. */
  name: string;
  /** `true` for `novalue="yes"`: return only the property name and parameters and a trailing `:`. */
  noValue: boolean;
}

/** Properties a partial vCard always carries so it stays a well-formed, interpretable card. */
const ALWAYS_KEPT = new Set(['BEGIN', 'END', 'VERSION']);

/**
 * The start of a content line up to its first `;` or `:` — the
 * (possibly group-prefixed) property name (RFC 6350 §3.3:
 * `[group "."] name *(";" param) ":" value`).
 */
function propertyNameOf(line: string): string {
  const end = line.search(/[;:]/);
  return (end === -1 ? line : line.slice(0, end)).toUpperCase();
}

/** `line` cut after its first `:` that isn't inside a double-quoted parameter value — the name and parameters, without the value. */
function withoutValue(line: string): string {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === ':' && !inQuotes) {
      return line.slice(0, index + 1);
    }
  }
  return line;
}

/**
 * Reduces `vcard` to the properties `selectors` name — the partial
 * retrieval RFC 6352 §8.4/§10.4 lets a client ask for via
 * `<C:address-data><C:prop name="FN"/>...</C:address-data>`, so a
 * client that only shows names doesn't download every contact's inline
 * `PHOTO`.
 *
 * A selector without a group prefix matches that property with or
 * without any group prefix; one with a prefix (`X-ABC.TEL`) matches
 * only exactly that (RFC 6352 §10.4.2). `BEGIN`, `END` and `VERSION` are
 * always kept so the result remains a card a client can parse. A
 * property's folded continuation lines (RFC 6350 §3.2) travel with it,
 * verbatim; the input's line-ending style is preserved.
 *
 * Limited to the RFC 6350/2426 fold rule (continuation lines start with
 * a space or tab) — vCard 2.1's quoted-printable soft breaks aren't
 * recognized as continuations.
 *
 * @param vcard - The raw vCard text.
 * @param selectors - The properties to keep; an empty list keeps only
 * `BEGIN`/`VERSION`/`END`.
 */
export function filterVCardProperties(
  vcard: string,
  selectors: readonly VCardPropertySelector[],
): string {
  const eol = vcard.includes('\r\n') ? '\r\n' : '\n';
  const endsWithEol = vcard.endsWith(eol);
  const physicalLines = vcard.split(/\r\n|\n|\r/);
  if (endsWithEol) {
    physicalLines.pop();
  }

  // Group each property's line with its fold continuations.
  const entries: string[][] = [];
  for (const line of physicalLines) {
    const isContinuation = line.startsWith(' ') || line.startsWith('\t');
    const last = entries.at(-1);
    if (isContinuation && last) {
      last.push(line);
    } else {
      entries.push([line]);
    }
  }

  const wanted = selectors.map((selector) => ({
    name: selector.name.toUpperCase(),
    noValue: selector.noValue,
  }));

  const kept: string[] = [];
  for (const entry of entries) {
    const fullName = propertyNameOf(entry[0]);
    const bareName = fullName.includes('.')
      ? fullName.slice(fullName.indexOf('.') + 1)
      : fullName;
    if (ALWAYS_KEPT.has(bareName)) {
      kept.push(...entry);
      continue;
    }
    const selector = wanted.find((candidate) =>
      candidate.name.includes('.')
        ? candidate.name === fullName
        : candidate.name === bareName,
    );
    if (!selector) {
      continue;
    }
    if (selector.noValue) {
      const unfolded = entry
        .map((line, index) => (index === 0 ? line : line.slice(1)))
        .join('');
      kept.push(withoutValue(unfolded));
    } else {
      kept.push(...entry);
    }
  }

  return kept.join(eol) + (endsWithEol ? eol : '');
}

/**
 * The vCard's declared version (`VERSION:3.0` → `'3.0'`), read straight
 * from the raw text with a line match rather than a full parse — cheap
 * enough to run per contact when a REPORT asks for a specific version.
 *
 * @returns The version, or `null` if no `VERSION` line is present.
 */
export function readVCardVersion(vcard: string): string | null {
  const match = /^VERSION:(.+?)\s*$/im.exec(vcard);
  return match?.[1] ?? null;
}

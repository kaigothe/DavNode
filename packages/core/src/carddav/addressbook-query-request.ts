import { create } from 'xmlbuilder2';
import {
  asElement,
  getAttributeValue,
  type XmlNode,
} from '../webdav/xml/xml-value.js';
import { parseReportPropertySelection } from './addressbook-report-request.js';
import type { ReportPropertySelection } from './addressbook-report-request.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';

/** How a `<C:text-match>` compares its text to a property value (RFC 6352 §10.5.4). */
export type TextMatchType = 'equals' | 'contains' | 'starts-with' | 'ends-with';

/** One `<C:text-match>` of a `<C:prop-filter>`. */
export interface TextMatch {
  /** The search text, exactly as sent (normalization is the query's job). */
  value: string;
  /** The `match-type` attribute; RFC default `contains`. */
  matchType: TextMatchType;
  /** `negate-condition="yes"`: match when the text does *not* match. */
  negate: boolean;
  /** The `collation` attribute, lowercased; RFC default `i;unicode-casemap`. */
  collation: string;
}

/** One `<C:param-filter>` — parsed only so the report can name it in a `supported-filter` precondition. */
export interface ParamFilter {
  /** The vCard parameter name exactly as the client sent it, e.g. `TYPE`. */
  name: string;
}

/** One `<C:prop-filter>` of a `<C:filter>` (RFC 6352 §10.5.1). */
export interface PropFilter {
  /** The vCard property name, uppercased (vCard names are case-insensitive, RFC 6350 §3.3). */
  name: string;
  /** The name exactly as the client sent it, for echoing back in a `supported-filter` precondition. */
  requestedName: string;
  /** How several `text-match`es combine; RFC default `anyof`. */
  test: 'anyof' | 'allof';
  /** `<C:is-not-defined/>`: the property must be absent. */
  isNotDefined: boolean;
  /** The `<C:text-match>` conditions. */
  textMatches: TextMatch[];
  /** The `<C:param-filter>` conditions. */
  paramFilters: ParamFilter[];
}

/** The `<C:filter>` of an `addressbook-query` (RFC 6352 §10.5). */
export interface AddressbookFilter {
  /** How the `prop-filter`s combine; RFC default `anyof`. */
  test: 'anyof' | 'allof';
  /** The `prop-filter`s; none means every contact matches. */
  propFilters: PropFilter[];
}

/** A parsed `CARDDAV:addressbook-query` request body (RFC 6352 §10.3). */
export interface AddressbookQueryRequestBody {
  /** The properties (and `address-data` options) to return per match. */
  selection: ReportPropertySelection;
  /** The filter to apply. */
  filter: AddressbookFilter;
  /** `<C:limit><C:nresults>`, if given. */
  limit: number | undefined;
}

/**
 * The most conditions (`prop-filter`s, `text-match`es and
 * `param-filter`s together) one query may carry. Each becomes a
 * correlated subquery, so an unbounded number — cheap to send, since the
 * body only has to fit the request size limit — would let a caller make
 * the database plan and run an arbitrarily large statement.
 */
export const MAX_FILTER_CONDITIONS = 100;

function parseTest(element: XmlNode, what: string): 'anyof' | 'allof' {
  const test = getAttributeValue(element.node, 'test');
  if (test === undefined) {
    return 'anyof';
  }
  if (test !== 'anyof' && test !== 'allof') {
    throw new Error(`${what} has an invalid test attribute "${test}".`);
  }
  return test;
}

function parseTextMatch(element: XmlNode): TextMatch {
  const matchType = getAttributeValue(element.node, 'match-type') ?? 'contains';
  if (
    matchType !== 'equals' &&
    matchType !== 'contains' &&
    matchType !== 'starts-with' &&
    matchType !== 'ends-with'
  ) {
    throw new Error(`text-match has an invalid match-type "${matchType}".`);
  }
  const negate = getAttributeValue(element.node, 'negate-condition') ?? 'no';
  if (negate !== 'yes' && negate !== 'no') {
    throw new Error(`text-match has an invalid negate-condition "${negate}".`);
  }
  return {
    value: element.node.textContent ?? '',
    matchType,
    negate: negate === 'yes',
    collation: (
      getAttributeValue(element.node, 'collation') ?? 'i;unicode-casemap'
    )
      .trim()
      .toLowerCase(),
  };
}

function parsePropFilter(element: XmlNode): PropFilter {
  const name = getAttributeValue(element.node, 'name')?.trim();
  if (name === undefined || name === '') {
    throw new Error('prop-filter is missing its name attribute.');
  }
  const propFilter: PropFilter = {
    name: name.toUpperCase(),
    requestedName: name,
    test: parseTest(element, 'prop-filter'),
    isNotDefined: false,
    textMatches: [],
    paramFilters: [],
  };
  element.each((child) => {
    const childElement = asElement(child.node);
    if (childElement?.namespaceURI !== CARDDAV_NAMESPACE) {
      return;
    }
    if (childElement.localName === 'is-not-defined') {
      propFilter.isNotDefined = true;
    } else if (childElement.localName === 'text-match') {
      propFilter.textMatches.push(parseTextMatch(child));
    } else if (childElement.localName === 'param-filter') {
      const paramName = getAttributeValue(child.node, 'name')?.trim();
      if (paramName === undefined || paramName === '') {
        throw new Error('param-filter is missing its name attribute.');
      }
      propFilter.paramFilters.push({ name: paramName });
    }
  });
  if (
    propFilter.isNotDefined &&
    (propFilter.textMatches.length > 0 || propFilter.paramFilters.length > 0)
  ) {
    throw new Error(
      'prop-filter combines is-not-defined with text-match or param-filter.',
    );
  }
  return propFilter;
}

function parseLimit(element: XmlNode): number {
  // `as` keeps TypeScript from narrowing this to `undefined`: it is only
  // assigned inside the callback, which control-flow analysis can't see.
  let nresults = undefined as string | undefined;
  element.each((child) => {
    const childElement = asElement(child.node);
    if (
      childElement?.namespaceURI === CARDDAV_NAMESPACE &&
      childElement.localName === 'nresults'
    ) {
      nresults = (child.node.textContent ?? '').trim();
    }
  });
  if (nresults === undefined || !/^\d{1,9}$/.test(nresults)) {
    throw new Error('limit needs a nresults holding an unsigned integer.');
  }
  return Number(nresults);
}

/**
 * Parses an `addressbook-query` REPORT request body.
 *
 * @throws An `Error` (including the XML parser's own `SyntaxError` for
 * malformed input) if `xml` isn't a well-formed
 * `CARDDAV:addressbook-query` document: another root element, no
 * `<C:filter>` (RFC 6352 §10.3 requires one), an invalid `test`,
 * `match-type` or `negate-condition` value, a `prop-filter`/`param-filter`
 * without `name`, `is-not-defined` together with other conditions, a
 * malformed `limit`, or more than {@link MAX_FILTER_CONDITIONS}
 * conditions.
 */
export function parseAddressbookQueryRequestBody(
  xml: string,
): AddressbookQueryRequestBody {
  const root: XmlNode = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'addressbook-query' ||
    rootElement.namespaceURI !== CARDDAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a CARDDAV:addressbook-query root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  // `as`: see parseLimit — assigned only inside the callback below.
  let filter = undefined as AddressbookFilter | undefined;
  let limit = undefined as number | undefined;
  root.each((child) => {
    const element = asElement(child.node);
    if (element?.namespaceURI !== CARDDAV_NAMESPACE) {
      return;
    }
    if (element.localName === 'filter') {
      const parsed: AddressbookFilter = {
        test: parseTest(child, 'filter'),
        propFilters: [],
      };
      child.each((filterChild) => {
        const filterElement = asElement(filterChild.node);
        if (
          filterElement?.namespaceURI === CARDDAV_NAMESPACE &&
          filterElement.localName === 'prop-filter'
        ) {
          parsed.propFilters.push(parsePropFilter(filterChild));
        }
      });
      filter = parsed;
    } else if (element.localName === 'limit') {
      limit = parseLimit(child);
    }
  });
  if (filter === undefined) {
    throw new Error('CARDDAV:addressbook-query body has no CARDDAV:filter.');
  }

  const conditionCount = filter.propFilters.reduce(
    (count, propFilter) =>
      count +
      1 +
      propFilter.textMatches.length +
      propFilter.paramFilters.length,
    0,
  );
  if (conditionCount > MAX_FILTER_CONDITIONS) {
    throw new Error(
      `Filter has ${conditionCount} conditions; at most ${MAX_FILTER_CONDITIONS} are allowed.`,
    );
  }

  return { selection: parseReportPropertySelection(root), filter, limit };
}

import type { EntityManager } from 'typeorm';
import { AddressObject } from '../entities/address-object.entity.js';
import { AddressObjectIndex } from '../entities/address-object-index.entity.js';
import type { ReportResult } from '../webdav/report-registry.js';
import {
  buildErrorResponse,
  type ErrorCondition,
} from '../webdav/xml/error-response-builder.js';
import { CARDDAV_NAMESPACE } from './carddav-namespace.js';
import { INDEXED_PROPERTY_NAMES, normalizeIndexValue } from './index-vcard.js';
import type {
  AddressbookFilter,
  PropFilter,
  TextMatch,
} from './addressbook-query-request.js';

/**
 * The collations `addressbook-query` accepts (RFC 6352 §8.3 requires
 * `i;ascii-casemap` and `i;unicode-casemap`; `default` is RFC 4790
 * §3.1's alias for the latter). All of them are served by the index's
 * lowercased values, so an `i;ascii-casemap` match also folds the case
 * of non-ASCII letters — a slightly wider match than that collation
 * defines. `i;octet` (case-sensitive) can't be honoured against
 * lowercased values and is refused rather than answered wrongly.
 */
const SUPPORTED_COLLATIONS: ReadonlySet<string> = new Set([
  'i;unicode-casemap',
  'i;ascii-casemap',
  'default',
]);

/** What a query's filter asks for that this server can't evaluate. */
export interface UnsupportedFilterParts {
  /** `prop-filter` names, as sent, that aren't indexed properties. */
  propFilters: string[];
  /** `param-filter` names, as sent — the index holds no parameters, so every one is unsupported. */
  paramFilters: string[];
  /** Collation identifiers, as sent (lowercased), outside `SUPPORTED_COLLATIONS`. */
  collations: string[];
}

/**
 * Finds what in `filter` can't be evaluated against the
 * `AddressObjectIndex`: `prop-filter`s on properties the index doesn't
 * hold (evaluating those would silently answer "not there" for every
 * contact — wrong, most visibly for `is-not-defined`, which would then
 * match everything), every `param-filter`, and unsupported collations.
 */
export function findUnsupportedFilterParts(
  filter: AddressbookFilter,
): UnsupportedFilterParts {
  const propFilters = new Set<string>();
  const paramFilters = new Set<string>();
  const collations = new Set<string>();
  for (const propFilter of filter.propFilters) {
    if (!INDEXED_PROPERTY_NAMES.includes(propFilter.name)) {
      propFilters.add(propFilter.requestedName);
    }
    for (const paramFilter of propFilter.paramFilters) {
      paramFilters.add(paramFilter.name);
    }
    for (const textMatch of propFilter.textMatches) {
      if (!SUPPORTED_COLLATIONS.has(textMatch.collation)) {
        collations.add(textMatch.collation);
      }
    }
  }
  return {
    propFilters: [...propFilters],
    paramFilters: [...paramFilters],
    collations: [...collations],
  };
}

/**
 * The `403` a filter with unsupported parts is answered with (RFC 6352
 * §8.6's preconditions): `CARDDAV:supported-filter` naming each
 * offending `prop-filter`/`param-filter` ("a server SHOULD report" them),
 * and/or `CARDDAV:supported-collation`.
 *
 * @returns The result, or `null` if nothing is unsupported.
 */
export function unsupportedFilterResult(
  parts: UnsupportedFilterParts,
): ReportResult | null {
  const conditions: ErrorCondition[] = [];
  if (parts.propFilters.length > 0 || parts.paramFilters.length > 0) {
    conditions.push({
      namespace: CARDDAV_NAMESPACE,
      name: 'supported-filter',
      children: [
        ...parts.propFilters.map((name) => ({
          namespace: CARDDAV_NAMESPACE,
          name: 'prop-filter',
          attributes: { name },
        })),
        ...parts.paramFilters.map((name) => ({
          namespace: CARDDAV_NAMESPACE,
          name: 'param-filter',
          attributes: { name },
        })),
      ],
    });
  }
  if (parts.collations.length > 0) {
    conditions.push({
      namespace: CARDDAV_NAMESPACE,
      name: 'supported-collation',
    });
  }
  return conditions.length === 0
    ? null
    : { status: 403, body: buildErrorResponse(conditions) };
}

/**
 * The character `LIKE` patterns escape with (`LIKE ... ESCAPE '!'`).
 * Deliberately not the backslash: a backslash inside a SQL string literal
 * is an escape character to MySQL but an ordinary character to Postgres
 * and SQLite, so no single backslash spelling of `ESCAPE` works on all
 * three — `!` is inert everywhere.
 */
const LIKE_ESCAPE = '!';

/** Escapes `%`, `_` and the escape character itself, so `text` matches only literally inside a `LIKE` pattern. */
function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, `${LIKE_ESCAPE}$&`);
}

/** A SQL condition plus the named parameters it binds. */
export interface FilterCondition {
  sql: string;
  parameters: Record<string, string>;
}

/**
 * Translates `filter` into one SQL condition over `AddressObject` rows
 * (aliased `objectAlias` in the enclosing query), evaluated purely
 * against `address_object_indexes` — never the vCard blob:
 *
 * - a `prop-filter` needs the property to exist
 *   (`EXISTS` an index row of that name), or not to
 *   (`NOT EXISTS`, for `is-not-defined`);
 * - each `text-match` is judged over *all* of the property's values
 *   (`EXISTS` a value matching the text), and `negate-condition` negates
 *   that whole result — "no value of this property contains PERSON",
 *   the reading of RFC 6352 §10.5.4 that SabreDAV and Radicale share;
 * - a `prop-filter`'s `text-match`es combine by its own `test`, the
 *   `prop-filter`s by the `filter`'s (`anyof` = OR, `allof` = AND).
 *
 * Search text is normalized like the indexed values
 * (`normalizeIndexValue`) and bound as a parameter, never spliced into
 * the SQL; for `LIKE` its `%`, `_` and escape characters are escaped.
 * `equals` is a plain `=`; the other match types are `LIKE ... ESCAPE '!'`.
 *
 * MySQL/MariaDB compare `text` case- *and accent*-insensitively by
 * default (`utf8mb4_0900_ai_ci`: `'josé' = 'jose'`), which neither the
 * collations nor Postgres/SQLite do. The values are already
 * case-folded, so on those engines the value is converted to `utf8mb4`
 * and compared under `utf8mb4_bin` to make accents count again.
 *
 * Table and column names come from TypeORM's metadata, quoted with the
 * driver's own escaping, so this works unchanged on every engine.
 *
 * @param manager - Supplies the connection (metadata, driver).
 * @param filter - The parsed filter; every part must already have passed
 * {@link findUnsupportedFilterParts}.
 * @param objectAlias - The alias of the `AddressObject` in the enclosing
 * query.
 * @returns The condition, or `null` when the filter has no `prop-filter`
 * (every contact matches).
 */
export function buildFilterCondition(
  manager: EntityManager,
  filter: AddressbookFilter,
  objectAlias: string,
): FilterCondition | null {
  if (filter.propFilters.length === 0) {
    return null;
  }

  const { connection } = manager;
  const escape = (name: string): string => connection.driver.escape(name);
  const indexMetadata = connection.getMetadata(AddressObjectIndex);
  const columnOf = (
    metadata: typeof indexMetadata,
    property: string,
  ): string => {
    const column = metadata.findColumnWithPropertyName(property);
    if (!column) {
      throw new Error(`No column for property "${property}".`);
    }
    return escape(column.databaseName);
  };
  const indexTable = escape(indexMetadata.tableName);
  const objectIdColumn = `${escape(objectAlias)}.${columnOf(
    connection.getMetadata(AddressObject),
    'id',
  )}`;
  const isMysql =
    connection.options.type === 'mysql' ||
    connection.options.type === 'mariadb';

  const parameters: Record<string, string> = {};

  /** `EXISTS (an index row of this property [that also satisfies condition])`. */
  const exists = (
    alias: string,
    propertyParameter: string,
    condition?: string,
  ): string => {
    const a = escape(alias);
    return (
      `EXISTS (SELECT 1 FROM ${indexTable} ${a} ` +
      `WHERE ${a}.${columnOf(indexMetadata, 'addressObjectId')} = ${objectIdColumn} ` +
      `AND ${a}.${columnOf(indexMetadata, 'propertyName')} = :${propertyParameter}` +
      (condition ? ` AND ${condition}` : '') +
      ')'
    );
  };

  const textMatchSql = (
    propFilterIndex: number,
    matchIndex: number,
    match: TextMatch,
  ): string => {
    const alias = `m${propFilterIndex}_${matchIndex}`;
    const valueParameter = `v${propFilterIndex}_${matchIndex}`;
    const text = normalizeIndexValue(match.value);
    let value = `${escape(alias)}.${columnOf(indexMetadata, 'propertyValue')}`;
    if (isMysql) {
      value = `CONVERT(${value} USING utf8mb4) COLLATE utf8mb4_bin`;
    }

    let comparison: string;
    if (match.matchType === 'equals') {
      parameters[valueParameter] = text;
      comparison = `${value} = :${valueParameter}`;
    } else {
      const escaped = escapeLike(text);
      parameters[valueParameter] =
        match.matchType === 'contains'
          ? `%${escaped}%`
          : match.matchType === 'starts-with'
            ? `${escaped}%`
            : `%${escaped}`;
      comparison = `${value} LIKE :${valueParameter} ESCAPE '${LIKE_ESCAPE}'`;
    }
    const found = exists(alias, `p${propFilterIndex}`, comparison);
    return match.negate ? `NOT ${found}` : found;
  };

  const propFilterSql = (propFilter: PropFilter, index: number): string => {
    parameters[`p${index}`] = propFilter.name;
    const defined = exists(`d${index}`, `p${index}`);
    if (propFilter.isNotDefined) {
      return `NOT ${defined}`;
    }
    if (propFilter.textMatches.length === 0) {
      return defined;
    }
    const operator = propFilter.test === 'allof' ? ' AND ' : ' OR ';
    const matches = propFilter.textMatches
      .map((match, matchIndex) => textMatchSql(index, matchIndex, match))
      .join(operator);
    return `${defined} AND (${matches})`;
  };

  const operator = filter.test === 'allof' ? ' AND ' : ' OR ';
  const sql = filter.propFilters
    .map((propFilter, index) => `(${propFilterSql(propFilter, index)})`)
    .join(operator);
  return { sql: `(${sql})`, parameters };
}

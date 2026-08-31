import { DefaultNamingStrategy } from 'typeorm';

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * TypeORM naming strategy that renders camelCase entity property names as
 * snake_case database columns (e.g. `quotaLimitBytes` becomes
 * `quota_limit_bytes`), matching the column names used throughout
 * planning/05-data-model.md, while entity classes keep idiomatic camelCase
 * TypeScript property names.
 *
 * Table names are deliberately left alone here: every entity names its
 * table explicitly via `@Entity('table_name')`, since the data model's
 * table names (e.g. `group_memberships`, `collection_aces`) don't follow a
 * mechanical pluralization rule this strategy could derive on its own.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
  /** Converts a column's property name (or custom name) to snake_case. */
  override columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    const base = customName || toSnakeCase(propertyName);
    return embeddedPrefixes.length
      ? `${embeddedPrefixes.map(toSnakeCase).join('_')}_${base}`
      : base;
  }

  /** Converts a relation's property name to snake_case. */
  override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  /** Converts a relation's foreign key column name to snake_case. */
  override joinColumnName(
    relationName: string,
    referencedColumnName: string,
  ): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  /** Converts a many-to-many join table's column name to snake_case. */
  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return toSnakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}

/**
 * The RFC 3744 §5.3 privilege vocabulary (planning/05-data-model.md,
 * section "ACL-Privilege-Katalog"), shared verbatim across all six ACE
 * tables (`collection_aces`, `file_aces`, and the calendar/addressbook
 * equivalents added in M5/M6) — a plain value vocabulary, not a foreign
 * key, so reusing it across domains doesn't conflict with the
 * domain-separation principle (planning/01-decisions.md, Runde 11).
 *
 * `write` and `all` are aggregated privileges, expanded to their
 * constituents at evaluation time rather than in the database — see
 * `expandPrivilege` in `privilege-aggregation.ts`.
 */
export type Privilege =
  | 'read'
  | 'write'
  | 'write-properties'
  | 'write-content'
  | 'bind'
  | 'unbind'
  | 'unlock'
  | 'read-acl'
  | 'write-acl'
  | 'read-current-user-privilege-set'
  | 'all';

/** All valid {@link Privilege} values. */
export const ALL_PRIVILEGES: readonly Privilege[] = [
  'read',
  'write',
  'write-properties',
  'write-content',
  'bind',
  'unbind',
  'unlock',
  'read-acl',
  'write-acl',
  'read-current-user-privilege-set',
  'all',
];

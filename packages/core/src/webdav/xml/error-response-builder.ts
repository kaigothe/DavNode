import { create } from 'xmlbuilder2';
import { DAV_NAMESPACE } from './request-parser.js';

const DAV_PREFIX = 'D';

/**
 * Builds an RFC 4918 §16-conformant `<D:error>` XML document, listing
 * one or more precondition/postcondition failure elements — e.g.
 * `no-protected-ace-conflict` for RFC 3744 §8.1.1's `ACL` method. Meant
 * to accompany a `403`/`409` response whose body needs to name exactly
 * which condition failed, rather than a bare status code.
 *
 * @param conditions - Local names (no `DAV:` prefix) of the failed
 * condition elements, e.g. `['no-protected-ace-conflict']`.
 */
export function buildErrorResponse(conditions: readonly string[]): string {
  const doc = create({ version: '1.0', encoding: 'utf-8' }).ele(
    DAV_NAMESPACE,
    `${DAV_PREFIX}:error`,
  );
  for (const condition of conditions) {
    doc.ele(DAV_NAMESPACE, `${DAV_PREFIX}:${condition}`);
  }
  return doc.end();
}

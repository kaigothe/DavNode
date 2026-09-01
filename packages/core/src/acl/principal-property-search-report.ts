import { create } from 'xmlbuilder2';
import { Group } from '../entities/group.entity.js';
import { User } from '../entities/user.entity.js';
import { PrincipalLiveProperties } from '../principals/principal-live-properties.js';
import { toPrincipalUrl } from '../principals/principal-url.js';
import {
  buildMultistatusResponse,
  type MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import { DAV_NAMESPACE, type PropertyName } from '../webdav/xml/request-parser.js';
import { asElement } from '../webdav/xml/xml-value.js';
import type { ReportContext, ReportHandler, ReportResult } from '../webdav/report-registry.js';

/**
 * One `<D:property-search>` block: the properties to check (`<D:prop>`)
 * and the substring to look for (`<D:match>`) — matched
 * case-insensitively. A principal satisfies this criterion if *any* of
 * `properties` contains `match` (RFC 3744 §9.4.1).
 */
export interface PropertySearchCriterion {
  properties: PropertyName[];
  match: string;
}

/** A parsed `principal-property-search` request body (RFC 3744 §9.4). */
export interface PrincipalPropertySearchRequestBody {
  /**
   * Every `<D:property-search>` block, combined with OR: a principal
   * matches the whole request if it satisfies *any* one of these
   * (RFC 3744 §9.4.1).
   */
  searches: PropertySearchCriterion[];
}

/**
 * Parses a `principal-property-search` request body into a
 * {@link PrincipalPropertySearchRequestBody}.
 *
 * `<D:apply-to-principal-collection-set/>`, if present, is deliberately
 * ignored: DavNode always searches within the requesting tenant's own
 * principals regardless (see {@link PrincipalPropertySearchReportHandler}),
 * so it changes nothing here.
 *
 * @throws An `Error` (including the underlying XML parser's own
 * `SyntaxError` for malformed input) if `xml` isn't a well-formed
 * `DAV:principal-property-search` document.
 */
export function parsePrincipalPropertySearchRequestBody(
  xml: string,
): PrincipalPropertySearchRequestBody {
  const root = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'principal-property-search' ||
    rootElement.namespaceURI !== DAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a DAV:principal-property-search root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  const searches: PropertySearchCriterion[] = [];
  root.each((child) => {
    const childElement = asElement(child.node);
    if (
      !childElement ||
      childElement.namespaceURI !== DAV_NAMESPACE ||
      childElement.localName !== 'property-search'
    ) {
      return;
    }

    const properties: PropertyName[] = [];
    let match: string | undefined;
    child.each((grandchild) => {
      const grandchildElement = asElement(grandchild.node);
      if (!grandchildElement || grandchildElement.namespaceURI !== DAV_NAMESPACE) {
        return;
      }
      if (grandchildElement.localName === 'prop') {
        grandchild.each((propertyNode) => {
          const propertyElement = asElement(propertyNode.node);
          if (propertyElement) {
            properties.push({
              namespace: propertyElement.namespaceURI ?? '',
              name: propertyElement.localName,
            });
          }
        });
      } else if (grandchildElement.localName === 'match') {
        match = grandchild.node.textContent ?? '';
      }
    });

    if (properties.length > 0 && match !== undefined) {
      searches.push({ properties, match });
    }
  });

  return { searches };
}

/**
 * The properties this report can actually search on. Only `displayname`
 * in M3 — the sub-task's own explicit scope ("in M3 reicht displayname,
 * weitere Properties können später ergänzt werden") — a criterion
 * naming any other property simply never matches, rather than erroring;
 * more properties can be added here later without changing the request
 * format.
 */
const SEARCHABLE_PROPERTY_NAMES = new Set(['displayname']);

function matchesCriterion(
  displayName: string,
  criterion: PropertySearchCriterion,
): boolean {
  const searchesDisplayName = criterion.properties.some(
    (property) =>
      property.namespace === DAV_NAMESPACE &&
      SEARCHABLE_PROPERTY_NAMES.has(property.name),
  );
  if (!searchesDisplayName) {
    return false;
  }
  return displayName.toLowerCase().includes(criterion.match.toLowerCase());
}

/**
 * RFC 3744 §9.4's `principal-property-search` REPORT: finds the current
 * tenant's `User`/`Group` principals whose `displayname` contains, as a
 * case-insensitive substring, any of the request's `<D:property-search>`
 * `<D:match>` values — typically used to pick a principal to grant
 * rights to via `ACL` (M3, `04-acl-http-method`).
 *
 * Registered into the generic REPORT dispatcher's `ReportRegistry`
 * (`report.route.ts`) under `DAV:principal-property-search`. Always
 * scoped to `context.tenant` — never a tenant-crossing search, per the
 * sub-task's explicit requirement.
 *
 * Responds `207 Multi-Status`, in the same shape PROPFIND uses
 * (`buildMultistatusResponse`): one `<D:response>` per matched
 * principal, reporting its `displayname`. No matches (including an
 * empty `searches` list) is still a valid, empty multistatus — not an
 * error.
 */
export class PrincipalPropertySearchReportHandler implements ReportHandler {
  /** See {@link ReportHandler.handle}. */
  async handle(
    requestXml: string,
    context: ReportContext,
  ): Promise<ReportResult> {
    const requestBody = parsePrincipalPropertySearchRequestBody(requestXml);
    const { tenant, manager } = context;

    const [users, groups] = await Promise.all([
      manager.getRepository(User).find({
        where: { tenantId: tenant.id },
        relations: { principal: true },
      }),
      manager.getRepository(Group).find({
        where: { tenantId: tenant.id },
        relations: { principal: true },
      }),
    ]);

    const liveProperties = new PrincipalLiveProperties();
    const resources: MultistatusResourceResult[] = [];

    for (const principal of [...users, ...groups]) {
      const displayName =
        principal instanceof User ? principal.username : principal.name;
      const matches = requestBody.searches.some((criterion) =>
        matchesCriterion(displayName, criterion),
      );
      if (!matches) {
        continue;
      }

      const properties = await liveProperties.listLiveProperties(
        principal,
        context,
      );
      const displaynameProperty = properties.find(
        (property) => property.name === 'displayname',
      );
      resources.push({
        href: toPrincipalUrl(principal.principal, tenant),
        properties: displaynameProperty
          ? [{ ...displaynameProperty, status: 200 }]
          : [],
      });
    }

    return { status: 207, body: buildMultistatusResponse(resources) };
  }
}

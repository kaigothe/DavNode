/** One trusted external OIDC identity provider (M10 — DavNode is only ever a resource server). */
export interface OAuth2IssuerConfig {
  /** The expected `iss` claim, compared exactly. */
  issuer: string;
  /** The expected `aud` claim. */
  audience: string;
  /** Explicit URL of the issuer's JWKS; no OIDC discovery in v1. */
  jwksUri: string;
}

/**
 * Parses the `DAVNODE_OAUTH2_ISSUERS` value: a JSON array of
 * `{ "issuer", "audience", "jwksUri" }` objects.
 *
 * @param raw - The raw environment value.
 * @returns The configured issuers; an empty list if `raw` is unset or blank.
 * @throws An `Error` naming the problem if `raw` is not valid JSON, not an
 * array, or an entry is missing a field, has a malformed `jwksUri`, or
 * repeats an issuer — a typo here must stop the server from starting,
 * never silently disable a login method.
 */
export function parseOAuth2IssuersConfig(
  raw: string | undefined,
): OAuth2IssuerConfig[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DAVNODE_OAUTH2_ISSUERS is not valid JSON.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('DAVNODE_OAUTH2_ISSUERS must be a JSON array.');
  }

  const issuers: OAuth2IssuerConfig[] = [];
  parsed.forEach((entry: unknown, index) => {
    const where = `DAVNODE_OAUTH2_ISSUERS[${index}]`;
    const record = (entry ?? {}) as Record<string, unknown>;
    for (const field of ['issuer', 'audience', 'jwksUri'] as const) {
      const value = record[field];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${where}.${field} must be a non-empty string.`);
      }
    }
    const config = record as unknown as OAuth2IssuerConfig;
    try {
      new URL(config.jwksUri);
    } catch {
      throw new Error(`${where}.jwksUri is not a valid URL.`);
    }
    if (issuers.some((existing) => existing.issuer === config.issuer)) {
      throw new Error(
        `${where}.issuer "${config.issuer}" is configured twice.`,
      );
    }
    issuers.push({
      issuer: config.issuer,
      audience: config.audience,
      jwksUri: config.jwksUri,
    });
  });
  return issuers;
}

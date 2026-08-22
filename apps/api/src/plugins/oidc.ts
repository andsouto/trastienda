import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import { type VerifyToken } from './auth.ts';

/**
 * Every asymmetric algorithm jose supports, and no symmetric one. Resolving keys
 * from a JWKS already makes jose refuse HMAC — a JWKS cannot yield a symmetric
 * key — so this is a second lock on the algorithm-confusion door rather than the
 * only one, and it also pins the set an issuer may sign with.
 */
const SIGNING_ALGORITHMS = [
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  'EdDSA', 'Ed25519',
];

/**
 * Verifies bearer tokens against the issuer's published keys. The keys are
 * located through OIDC discovery on first use rather than at boot, so the API
 * can start before the identity provider is reachable; a failed discovery is
 * not cached.
 */
export function createTokenVerifier(options: { audience: string; issuer: string }): VerifyToken {
  let keys: Promise<JWTVerifyGetKey> | undefined;

  const resolveKeys = async (): Promise<JWTVerifyGetKey> => {
    // Caching the promise rather than the result means concurrent first
    // requests share a single discovery round trip.
    keys ??= discoverKeys(options.issuer);

    try {
      return await keys;
    } catch (error) {
      keys = undefined;
      throw error;
    }
  };

  return async (token) => {
    const { payload } = await jwtVerify(token, await resolveKeys(), {
      algorithms: SIGNING_ALGORITHMS,
      audience: options.audience,
      issuer: options.issuer,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new TypeError('token carries no subject');
    }

    return { subject: payload.sub };
  };
}

/**
 * The JWKS location comes from discovery rather than a guessed path: every
 * provider puts it somewhere different (Zitadel `/oauth/v2/keys`, Keycloak
 * `/protocol/openid-connect/certs`), and being provider-agnostic is the point
 * of ADR-0008.
 */
async function discoverKeys(issuer: string): Promise<JWTVerifyGetKey> {
  const response = await fetch(new URL('.well-known/openid-configuration', `${trimSlash(issuer)}/`));

  if (!response.ok) {
    throw new Error(`OIDC discovery failed for ${issuer}: HTTP ${String(response.status)}`);
  }

  const document = (await response.json()) as { issuer?: unknown; jwks_uri?: unknown };

  // A document claiming a different issuer is either a misconfiguration or
  // someone pointing us at their own keys.
  if (typeof document.issuer !== 'string' || trimSlash(document.issuer) !== trimSlash(issuer)) {
    throw new Error(`OIDC discovery for ${issuer} returned a document for a different issuer`);
  }

  if (typeof document.jwks_uri !== 'string') {
    throw new TypeError(`OIDC discovery for ${issuer} returned no jwks_uri`);
  }

  return createRemoteJWKSet(new URL(document.jwks_uri));
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

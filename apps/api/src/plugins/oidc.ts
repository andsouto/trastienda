import {
  createRemoteJWKSet,
  type JWTHeaderParameters,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';

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
 * Claims OpenID Connect defines for ID tokens only. `auth_time`, `azp` and
 * `sid` are not on the list: some providers put them in access tokens too.
 */
const ID_TOKEN_CLAIMS = ['nonce', 'at_hash', 'c_hash'];

/**
 * Verifies bearer tokens against the issuer's published keys. The keys are
 * located through OIDC discovery on first use rather than at boot, so the API
 * can start before the identity provider is reachable; a failed discovery is
 * not cached.
 */
export interface TokenVerifierOptions {
  audience: string;
  issuer: string;
  /**
   * Whether the provider types its access tokens `at+jwt` (RFC 9068), which is
   * then required of every token. See `requireAccessToken` for what happens
   * without it.
   */
  typedAccessTokens: boolean;
}

export function createTokenVerifier(options: TokenVerifierOptions): VerifyToken {
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
    const { payload, protectedHeader } = await jwtVerify(token, await resolveKeys(), {
      algorithms: SIGNING_ALGORITHMS,
      audience: options.audience,
      issuer: options.issuer,
    });

    requireAccessToken(protectedHeader, payload, options.typedAccessTokens);

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new TypeError('token carries no subject');
    }

    return { subject: payload.sub };
  };
}

/**
 * An issuer signs ID tokens with the same keys as access tokens, and RFC 8725
 * §3.12 requires telling them apart. The standard way is RFC 9068's: an access
 * token is typed `at+jwt`, and a resource server refuses any other type.
 *
 * A provider that does not type its access tokens leaves the audience, which
 * refuses an ID token as long as the provider keeps the API's audience out of
 * it. Zitadel does not: its project, our audience, is in every token. So
 * without typing, a token that carries an ID token's claims is refused too.
 * OpenID Connect makes those claims optional, so that rests on Zitadel putting
 * `at_hash` in every ID token it issues alongside an access token. ADR-0008.
 */
function requireAccessToken(header: JWTHeaderParameters, payload: JWTPayload, requiresTyping: boolean): void {
  // Media types compare case-insensitively, and `application/` is optional.
  const type = header.typ?.toLowerCase().replace(/^application\//, '');

  if (requiresTyping) {
    if (type !== 'at+jwt') {
      throw new TypeError(`a token typed ${String(header.typ)} is not an RFC 9068 access token`);
    }

    return;
  }

  // A `typ` naming another kind of JWT (a `logout+jwt`, say) is no access token.
  if (type !== undefined && type !== 'jwt' && type !== 'at+jwt') {
    throw new TypeError(`a token typed ${String(header.typ)} is not an access token`);
  }

  const claim = ID_TOKEN_CLAIMS.find(name => Object.hasOwn(payload, name));

  if (claim !== undefined) {
    throw new TypeError(`token carries ${claim}: an ID token is not an access token`);
  }
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

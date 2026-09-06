import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AuthenticatedUser {
  /**
  The token's `sub` claim.
  */
  subject: string;
}

export type VerifyToken = (token: string) => Promise<AuthenticatedUser>;

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

const BEARER_PREFIX = 'Bearer ';

async function verify(
  token: string,
  getKey: JWTVerifyGetKey,
  issuer: string,
  audience: string,
): Promise<AuthenticatedUser> {
  const { payload } = await jwtVerify(token, getKey, {
    algorithms: SIGNING_ALGORITHMS,
    audience,
    issuer,
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new TypeError('token carries no subject');
  }

  return { subject: payload.sub };
}

export interface TokenVerifierOptions {
  audience: string;
  /**
  Key resolver. Tests pass `createLocalJWKSet`, production the remote one.
  */
  getKey: JWTVerifyGetKey;
  issuer: string;
}

export function createTokenVerifier(options: TokenVerifierOptions): VerifyToken {
  return token => verify(token, options.getKey, options.issuer, options.audience);
}

function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/+$/, '');
}

/**
 * Resolves the JWKS URI through OIDC discovery rather than guessing it: every
 * provider puts it somewhere different (Zitadel `/oauth/v2/keys`, Keycloak
 * `/protocol/openid-connect/certs`), and being provider-agnostic is the whole
 * point of ADR-0008.
 */
async function discoverJwksUri(issuer: string): Promise<URL> {
  const discoveryUrl = new URL('.well-known/openid-configuration', `${normalizeIssuer(issuer)}/`);
  const response = await fetch(discoveryUrl);

  if (!response.ok) {
    throw new Error(`OIDC discovery failed for ${issuer}: HTTP ${String(response.status)}`);
  }

  const document = (await response.json()) as { issuer?: unknown; jwks_uri?: unknown };

  // A discovery document claiming a different issuer is either a
  // misconfiguration or someone redirecting us at their own keys.
  if (typeof document.issuer !== 'string' || normalizeIssuer(document.issuer) !== normalizeIssuer(issuer)) {
    throw new Error(`OIDC discovery for ${issuer} returned a document for a different issuer`);
  }

  if (typeof document.jwks_uri !== 'string') {
    throw new TypeError(`OIDC discovery for ${issuer} returned no jwks_uri`);
  }

  return new URL(document.jwks_uri);
}

async function loadKeys(issuer: string): Promise<JWTVerifyGetKey> {
  return createRemoteJWKSet(await discoverJwksUri(issuer));
}

export interface RemoteTokenVerifierOptions {
  audience: string;
  issuer: string;
}

/**
 * Discovery runs on first use, not at boot, so the API survives starting before
 * the identity provider is reachable. A failed attempt is not cached.
 */
export function createRemoteTokenVerifier(options: RemoteTokenVerifierOptions): VerifyToken {
  let keys: Promise<JWTVerifyGetKey> | undefined;

  const resolveKeys = async (): Promise<JWTVerifyGetKey> => {
    // Caching the promise rather than the result means concurrent first
    // requests share a single discovery round trip.
    keys ??= loadKeys(options.issuer);

    try {
      return await keys;
    } catch (error) {
      // Not cached on failure: the provider may simply have been slow to boot.
      keys = undefined;
      throw error;
    }
  };

  return async token => verify(token, await resolveKeys(), options.issuer, options.audience);
}

/**
 * Reads the caller inside an authenticated scope. Throws rather than returning
 * null: a route that reaches this without a token is registered in the wrong
 * scope, which is a wiring bug and should say so loudly.
 */
export function authenticatedUser(request: FastifyRequest): AuthenticatedUser {
  if (request.auth === null) {
    throw new Error(`${request.url} read the caller but is not inside the authenticated scope`);
  }

  return request.auth;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedUser | null;
  }
}

function unauthorized(reply: FastifyReply, challenge: string, message: string): FastifyReply {
  return reply.code(401).header('WWW-Authenticate', challenge).send({ message });
}

/**
 * Puts every route of `scope` behind a valid bearer token.
 *
 * Not a Fastify plugin on purpose. A plugin would need `fastify-plugin` to stop
 * its hook being encapsulated away from the routes it should cover, and the
 * indirection buys nothing: this is "protect this scope", and the scope is the
 * boundary. Whether an endpoint needs a token is therefore answered by where it
 * is registered, not by remembering a per-route flag.
 */
export function protectScope(scope: FastifyInstance, verifyToken: VerifyToken): void {
  scope.addHook('onRequest', async (request, reply) => {
    const header = request.headers.authorization;

    if (!header?.startsWith(BEARER_PREFIX)) {
      return unauthorized(reply, 'Bearer', 'missing bearer token');
    }

    try {
      request.auth = await verifyToken(header.slice(BEARER_PREFIX.length));
    } catch {
      // The reason stays in the logs, not in the response: telling a caller
      // which check failed helps nobody but an attacker.
      request.log.debug('token rejected');

      return unauthorized(reply, 'Bearer error="invalid_token"', 'invalid token');
    }

    return;
  });
}

import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  /**
  The token's `sub` claim.
  */
  subject: string;
}

/**
 * What `protectScope` needs from the outside: something that turns a bearer
 * token into a caller or throws. `oidc.ts` provides the real one.
 */
export type VerifyToken = (token: string) => Promise<AuthenticatedUser>;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedUser | null;
  }
}

const BEARER_PREFIX = 'Bearer ';

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
    } catch (error) {
      request.log.debug({ err: error }, 'token rejected');

      return unauthorized(reply, 'Bearer error="invalid_token"', 'invalid token');
    }

    return;
  });
}

/**
 * Reads the caller inside a protected scope. Throws rather than returning
 * null: a route that reaches this without a token is registered in the wrong
 * scope, which is a wiring bug and should say so loudly.
 */
export function authenticatedUser(request: FastifyRequest): AuthenticatedUser {
  if (request.auth === null) {
    throw new Error(`${request.url} read the caller but is not inside a protected scope`);
  }

  return request.auth;
}

function unauthorized(reply: FastifyReply, challenge: string, message: string): FastifyReply {
  return reply.code(401).header('WWW-Authenticate', challenge).send({ message });
}

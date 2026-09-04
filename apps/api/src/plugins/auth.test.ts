import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  SignJWT,
} from 'jose';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.ts';
import { createRemoteTokenVerifier, createTokenVerifier } from './auth.ts';

const ISSUER = 'https://idp.example.test';
const AUDIENCE = 'trastienda-api';
const KEY_ID = 'test-key';

let signingKey: CryptoKey;
let strangerKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const trusted = await generateKeyPair('RS256', { extractable: true });
  const stranger = await generateKeyPair('RS256', { extractable: true });

  signingKey = trusted.privateKey;
  strangerKey = stranger.privateKey;
  publicJwk = { ...(await exportJWK(trusted.publicKey)), alg: 'RS256', kid: KEY_ID };
});

interface TokenOptions {
  audience?: string;
  expiresIn?: string;
  issuer?: string;
  key?: CryptoKey;
  subject?: string | null;
}

async function signToken(options: TokenOptions = {}): Promise<string> {
  const token = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? '5m');

  if (options.subject !== null) {
    token.setSubject(options.subject ?? 'user-42');
  }

  return token.sign(options.key ?? signingKey);
}

async function buildTestApp() {
  return buildApp({
    verifyToken: createTokenVerifier({
      audience: AUDIENCE,
      getKey: createLocalJWKSet({ keys: [publicJwk] }),
      issuer: ISSUER,
    }),
  });
}

async function get(authorization?: string) {
  const app = await buildTestApp();

  try {
    return await app.inject({
      headers: authorization === undefined ? {} : { authorization },
      method: 'GET',
      url: '/me',
    });
  } finally {
    await app.close();
  }
}

it('accepts a valid token and exposes the subject', async () => {
  const response = await get(`Bearer ${await signToken({ subject: 'user-7' })}`);

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ subject: 'user-7' });
});

describe('rejects', () => {
  it('a request with no Authorization header', async () => {
    const response = await get();

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('a scheme other than Bearer', async () => {
    const response = await get('Basic dXNlcjpwYXNz');

    expect(response.statusCode).toBe(401);
  });

  it('a token that is not a JWT at all', async () => {
    const response = await get('Bearer not-a-token');

    expect(response.statusCode).toBe(401);
  });

  it('an expired token', async () => {
    const response = await get(`Bearer ${await signToken({ expiresIn: '-1m' })}`);

    expect(response.statusCode).toBe(401);
  });

  it('a token issued for another audience', async () => {
    const response = await get(`Bearer ${await signToken({ audience: 'someone-else' })}`);

    expect(response.statusCode).toBe(401);
  });

  it('a token from another issuer', async () => {
    const response = await get(`Bearer ${await signToken({ issuer: 'https://evil.example.test' })}`);

    expect(response.statusCode).toBe(401);
  });

  it('a token signed by a key that is not in the JWKS', async () => {
    const response = await get(`Bearer ${await signToken({ key: strangerKey })}`);

    expect(response.statusCode).toBe(401);
  });

  it('a token carrying no subject', async () => {
    const response = await get(`Bearer ${await signToken({ subject: null })}`);

    expect(response.statusCode).toBe(401);
  });

  // Algorithm confusion: the JWKS is public, so an HMAC token signed with the
  // public key must never verify.
  it('an HMAC-signed token', async () => {
    const hmacToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: KEY_ID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user-42')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(JSON.stringify(publicJwk)));

    const response = await get(`Bearer ${hmacToken}`);

    expect(response.statusCode).toBe(401);
  });

  it('does not leak why the token failed', async () => {
    const response = await get(`Bearer ${await signToken({ expiresIn: '-1m' })}`);

    expect(response.json()).toEqual({ message: 'invalid token' });
  });
});

/**
 * A loopback OIDC provider: enough of one to exercise discovery, the JWKS fetch
 * and the caching around them for real, instead of stubbing `fetch` and testing
 * the stub.
 */
function startFakeIdp(publicKey: JWK) {
  let issuer = '';
  const discoveryRequests: string[] = [];
  const state = { discoveryStatus: 200, issuerClaim: (): string => issuer };

  const server: Server = createServer((request, response) => {
    if (request.url === '/.well-known/openid-configuration') {
      discoveryRequests.push(request.url);

      if (state.discoveryStatus !== 200) {
        response.writeHead(state.discoveryStatus).end();

        return;
      }

      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ issuer: state.issuerClaim(), jwks_uri: `${issuer}/jwks` }));

      return;
    }

    if (request.url === '/jwks') {
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ keys: [publicKey] }));

      return;
    }

    response.writeHead(404).end();
  });

  return {
    close: async () => new Promise<void>(resolve => void server.close(() => {resolve();})),
    discoveryRequests,
    get issuer() {
      return issuer;
    },
    start: async () => {
      await new Promise<void>(resolve => void server.listen(0, '127.0.0.1', resolve));
      issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    },
    state,
  };
}

describe('remote verifier', () => {
  it('discovers the JWKS, verifies against it, and discovers only once', async () => {
    const idp = startFakeIdp(publicJwk);
    await idp.start();

    try {
      const verify = createRemoteTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer });

      const first = await verify(await signToken({ issuer: idp.issuer, subject: 'user-9' }));
      const second = await verify(await signToken({ issuer: idp.issuer, subject: 'user-9' }));

      expect(first.subject).toBe('user-9');
      expect(second.subject).toBe('user-9');
      expect(idp.discoveryRequests).toHaveLength(1);
    } finally {
      await idp.close();
    }
  });

  it('rejects a discovery document issued for a different issuer', async () => {
    const idp = startFakeIdp(publicJwk);
    await idp.start();
    idp.state.issuerClaim = () => 'https://somewhere.else.test';

    try {
      const verify = createRemoteTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer });

      await expect(verify(await signToken({ issuer: idp.issuer }))).rejects.toThrow(
        /different issuer/,
      );
    } finally {
      await idp.close();
    }
  });

  it('retries discovery after a failure instead of caching it', async () => {
    const idp = startFakeIdp(publicJwk);
    await idp.start();
    idp.state.discoveryStatus = 503;

    try {
      const verify = createRemoteTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer });

      await expect(verify(await signToken({ issuer: idp.issuer }))).rejects.toThrow(/HTTP 503/);

      idp.state.discoveryStatus = 200;

      const user = await verify(await signToken({ issuer: idp.issuer, subject: 'user-3' }));

      expect(user.subject).toBe('user-3');
      expect(idp.discoveryRequests).toHaveLength(2);
    } finally {
      await idp.close();
    }
  });
});

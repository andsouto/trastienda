import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTokenVerifier } from './oidc.ts';

const AUDIENCE = 'trastienda-api';
const KEY_ID = 'test-key';

const trusted = await generateKeyPair('RS256', { extractable: true });
const stranger = await generateKeyPair('RS256', { extractable: true });
const publicJwk: JWK = { ...(await exportJWK(trusted.publicKey)), alg: 'RS256', kid: KEY_ID };

/**
 * A loopback OIDC provider: enough of one to exercise discovery, the JWKS fetch
 * and the caching around them for real, instead of stubbing `fetch` and testing
 * the stub.
 */
function fakeIdp() {
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
        .end(JSON.stringify({ keys: [publicJwk] }));

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

interface TokenOptions {
  audience?: string;
  expiresIn?: string;
  issuer: string;
  key?: CryptoKey;
  subject?: string | null;
}

async function signToken(options: TokenOptions): Promise<string> {
  const token = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(options.issuer)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? '5m');

  if (options.subject !== null) {
    token.setSubject(options.subject ?? 'user-42');
  }

  return token.sign(options.key ?? trusted.privateKey);
}

describe('against a healthy provider', () => {
  const idp = fakeIdp();

  beforeAll(async () => {
    await idp.start();
  });
  afterAll(async () => {
    await idp.close();
  });

  const verifier = () => createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer });
  const token = async (overrides: Omit<TokenOptions, 'issuer'> = {}) =>
    signToken({ issuer: idp.issuer, ...overrides });

  it('accepts a valid token and returns its subject', async () => {
    await expect(verifier()(await token({ subject: 'user-9' }))).resolves.toEqual({ subject: 'user-9' });
  });

  it('discovers the JWKS once per verifier, however many tokens it checks', async () => {
    const verify = verifier();
    const before = idp.discoveryRequests.length;

    await verify(await token());
    await verify(await token());

    expect(idp.discoveryRequests.length - before).toBe(1);
  });

  it.each<[string, Partial<TokenOptions>]>([
    ['is expired', { expiresIn: '-1m' }],
    ['was issued for another audience', { audience: 'someone-else' }],
    ['names another issuer', { issuer: 'https://evil.example.test' }],
    ['is signed by a key that is not in the JWKS', { key: stranger.privateKey }],
    ['carries no subject', { subject: null }],
  ])('rejects a token that %s', async (_case, overrides) => {
    await expect(verifier()(await token(overrides))).rejects.toThrow();
  });

  it('rejects something that is not a JWT at all', async () => {
    await expect(verifier()('not-a-token')).rejects.toThrow();
  });

  // Algorithm confusion: the JWKS is public, so an HMAC token signed with the
  // public key must never verify.
  it('rejects an HMAC-signed token', async () => {
    const hmacToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: KEY_ID })
      .setIssuedAt()
      .setIssuer(idp.issuer)
      .setAudience(AUDIENCE)
      .setSubject('user-42')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(JSON.stringify(publicJwk)));

    await expect(verifier()(hmacToken)).rejects.toThrow();
  });
});

describe('discovery', () => {
  it('rejects a document issued for a different issuer', async () => {
    const idp = fakeIdp();
    await idp.start();
    idp.state.issuerClaim = () => 'https://somewhere.else.test';

    try {
      const verify = createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer });

      await expect(verify(await signToken({ issuer: idp.issuer }))).rejects.toThrow(/different issuer/);
    } finally {
      await idp.close();
    }
  });

  it('is retried after a failure instead of cached', async () => {
    const idp = fakeIdp();
    await idp.start();
    idp.state.discoveryStatus = 503;

    try {
      const verify = createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer });

      await expect(verify(await signToken({ issuer: idp.issuer }))).rejects.toThrow(/HTTP 503/);

      idp.state.discoveryStatus = 200;

      await expect(verify(await signToken({ issuer: idp.issuer, subject: 'user-3' }))).resolves.toEqual({
        subject: 'user-3',
      });
      expect(idp.discoveryRequests).toHaveLength(2);
    } finally {
      await idp.close();
    }
  });
});

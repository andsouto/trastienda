import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTokenVerifier } from './oidc.ts';

const AUDIENCE = 'trastienda';
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
  claims?: Record<string, unknown>;
  expiresIn?: string;
  issuer: string;
  key?: CryptoKey;
  notBefore?: string;
  subject?: string | null;
  /**
  The `typ` header: RFC 9068's `at+jwt` unless given, none if null.
  */
  type?: string | null;
}

async function signToken(options: TokenOptions): Promise<string> {
  const type = options.type === undefined ? 'at+jwt' : options.type;
  const token = new SignJWT(options.claims ?? {})
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID, ...(type !== null && { typ: type }) })
    .setIssuedAt()
    .setIssuer(options.issuer)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? '5m');

  if (options.subject !== null) {
    token.setSubject(options.subject ?? 'user-42');
  }

  if (options.notBefore !== undefined) {
    token.setNotBefore(options.notBefore);
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

  const verifier = () => createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer, typedAccessTokens: true });
  const untypedVerifier = () => createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer, typedAccessTokens: false });
  const token = async (overrides: Omit<TokenOptions, 'issuer'> = {}) =>
    signToken({ issuer: idp.issuer, ...overrides });

  it('accepts a valid token and returns its subject', async () => {
    await expect(verifier()(await token({ subject: 'user-9' }))).resolves.toEqual({ subject: 'user-9' });
  });

  // A provider whose clock runs ahead of the API's issues tokens that, by the
  // API's clock, are not valid yet.
  it('accepts a token not valid for a few seconds yet', async () => {
    await expect(verifier()(await token({ notBefore: '10s' }))).resolves.toEqual({ subject: 'user-42' });
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
    ['is not valid for minutes yet', { notBefore: '2m' }],
    ['was issued for another audience', { audience: 'someone-else' }],
    ['names another issuer', { issuer: 'https://evil.example.test' }],
    ['is signed by a key that is not in the JWKS', { key: stranger.privateKey }],
    ['carries no subject', { subject: null }],
  ])('rejects a token that %s', async (_case, overrides) => {
    await expect(verifier()(await token(overrides))).rejects.toThrow();
  });

  describe('from a provider that types its access tokens (RFC 9068)', () => {
    it.each(['at+jwt', 'application/at+jwt', 'AT+JWT'])('accepts an access token typed %s', async (type) => {
      await expect(verifier()(await token({ type }))).resolves.toEqual({ subject: 'user-42' });
    });

    // A Zitadel ID token is typed JWT, and so is a Zitadel access token: in
    // this mode both are refused, by their type alone.
    it.each<[string, string | null]>([
      ['typed JWT', 'JWT'],
      ['with no type', null],
      ['typed as another kind of JWT', 'logout+jwt'],
    ])('rejects a token %s', async (_case, type) => {
      await expect(verifier()(await token({ type }))).rejects.toThrow(/not an RFC 9068 access token/);
    });
  });

  describe('from a provider that does not, like Zitadel', () => {
    it.each<[string, string | null]>([
      ['typed JWT', 'JWT'],
      ['with no type', null],
      ['typed at+jwt', 'at+jwt'],
    ])('accepts an access token %s', async (_case, type) => {
      await expect(untypedVerifier()(await token({ type }))).resolves.toEqual({ subject: 'user-42' });
    });

    // Zitadel signs ID tokens with the same key, issuer, audience and `typ: JWT`
    // as access tokens: only their claims give them away.
    it.each(['nonce', 'at_hash', 'c_hash'])('rejects an ID token, which carries %s', async (claim) => {
      await expect(untypedVerifier()(await token({ claims: { [claim]: 'x' }, type: 'JWT' }))).rejects.toThrow(/ID token/);
    });

    // What Zitadel issues from a code flow that sent no nonce: at_hash is the
    // one marker left, and it is enough.
    it('rejects a Zitadel ID token from a code flow without a nonce', async () => {
      const idToken = await token({
        claims: {
          amr: ['pwd'],
          at_hash: 'G55RWt0LFbj5C5lXBPQVJA',
          auth_time: 1_791_672_158,
          azp: 'admin-client',
          client_id: 'admin-client',
          sid: 'session-1',
        },
        type: 'JWT',
      });

      await expect(untypedVerifier()(idToken)).rejects.toThrow(/ID token/);
    });

    it('rejects a token typed as another kind of JWT', async () => {
      await expect(untypedVerifier()(await token({ type: 'logout+jwt' }))).rejects.toThrow(/not an access token/);
    });
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
      const verify = createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer, typedAccessTokens: true });

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
      const verify = createTokenVerifier({ audience: AUDIENCE, issuer: idp.issuer, typedAccessTokens: true });

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

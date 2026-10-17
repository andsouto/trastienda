import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { APP_CONFIG } from '../config/app-config';
import { Auth, type Session } from './auth';

const ISSUER = 'http://localhost:8080';
const TOKEN_ENDPOINT = `${ISSUER}/oauth/v2/token`;

const discovery = {
  authorization_endpoint: `${ISSUER}/oauth/v2/authorize`,
  end_session_endpoint: `${ISSUER}/oidc/v1/end_session`,
  issuer: ISSUER,
  token_endpoint: TOKEN_ENDPOINT,
};

/**
 * A provider behind a stubbed fetch, answering discovery and handing token
 * requests to `answerToken`.
 */
function fakeProvider(answerToken: () => Promise<Response>) {
  const tokenRequests: string[] = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Response.json(discovery);
    }

    if (url === TOKEN_ENDPOINT) {
      tokenRequests.push(url);

      return answerToken();
    }

    return new Response(null, { status: 404 });
  }));

  return { tokenRequests };
}

function startWith(session: Pick<Session, 'expiresAt'>) {
  sessionStorage.setItem('trastienda.session', JSON.stringify({
    accessToken: 'old-access',
    idToken: 'id-token',
    refreshToken: 'old-refresh',
    user: { subject: 'user-42' },
    ...session,
  }));

  const location = { origin: 'http://localhost:4200', pathname: '/products', search: '' };

  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://localhost:3000', clientId: 'admin', issuer: ISSUER } },
      { provide: DOCUMENT, useValue: { location } },
    ],
  });

  return { auth: TestBed.inject(Auth) };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('hands out a fresh access token without asking the provider', async () => {
  const provider = fakeProvider(() => Promise.reject(new Error('not expected')));
  const { auth } = startWith({ expiresAt: Date.now() + 5 * 60_000 });

  await expect(auth.accessToken()).resolves.toBe('old-access');
  expect(provider.tokenRequests).toHaveLength(0);
});

it('renews a token about to expire once, however many requests wait for it', async () => {
  const provider = fakeProvider(() => Promise.resolve(Response.json({
    access_token: 'new-access',
    expires_in: 300,
    refresh_token: 'new-refresh',
    token_type: 'Bearer',
  })));
  const { auth } = startWith({ expiresAt: Date.now() + 10_000 });

  const tokens = await Promise.all([auth.accessToken(), auth.accessToken(), auth.accessToken()]);

  expect(tokens).toEqual(['new-access', 'new-access', 'new-access']);
  expect(provider.tokenRequests).toHaveLength(1);
  expect(auth.session()).toMatchObject({ idToken: 'id-token', refreshToken: 'new-refresh', user: { subject: 'user-42' } });
});

// login() itself is left out: under jsdom, Node's WebCrypto hands oauth4webapi
// an ArrayBuffer from another realm, which a browser never does.
it('ends the session and logs in again when the provider refuses to renew', async () => {
  fakeProvider(() => Promise.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 })));
  const { auth } = startWith({ expiresAt: Date.now() - 1000 });
  const login = vi.spyOn(auth, 'login').mockResolvedValue();

  await expect(auth.accessToken()).resolves.toBeNull();
  expect(auth.session()).toBeNull();
  expect(sessionStorage.getItem('trastienda.session')).toBeNull();
  expect(login).toHaveBeenCalledWith('/products');
});

it('ends the session on logout even when the provider cannot be reached', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
  const { auth } = startWith({ expiresAt: Date.now() + 5 * 60_000 });

  await expect(auth.logout()).rejects.toThrow();
  expect(auth.session()).toBeNull();
  expect(sessionStorage.getItem('trastienda.session')).toBeNull();
});

it('keeps the session when the renewal does not reach the provider', async () => {
  fakeProvider(() => Promise.reject(new TypeError('fetch failed')));
  const { auth } = startWith({ expiresAt: Date.now() - 1000 });

  await expect(auth.accessToken()).rejects.toThrow();
  expect(auth.session()).toMatchObject({ accessToken: 'old-access', refreshToken: 'old-refresh' });
});

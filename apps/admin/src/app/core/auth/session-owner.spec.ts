import { SessionOwner, type SessionView } from './session-owner';

const ISSUER = 'http://localhost:8080';
const ORIGIN = 'http://localhost:4200';
const CLIENT_ID = 'admin';

const discovery = {
  authorization_endpoint: `${ISSUER}/oauth/v2/authorize`,
  end_session_endpoint: `${ISSUER}/oidc/v1/end_session`,
  issuer: ISSUER,
  revocation_endpoint: `${ISSUER}/oauth/v2/revoke`,
  token_endpoint: `${ISSUER}/oauth/v2/token`,
  userinfo_endpoint: `${ISSUER}/oidc/v1/userinfo`,
};

/**
 * A provider behind a stubbed fetch: discovery and userinfo answer by
 * themselves, token and revocation requests are recorded, and token requests
 * get what the test sets.
 */
function fakeProvider() {
  const requests: { body: URLSearchParams; url: string }[] = [];
  let answerToken = noTokenAnswer;
  let isDown = false;

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (isDown) {
      throw new TypeError('Failed to fetch');
    }

    const body = new URLSearchParams(init?.body as URLSearchParams | undefined);

    switch (url) {
      case `${ISSUER}/.well-known/openid-configuration`: {
        return Response.json(discovery);
      }
      case discovery.revocation_endpoint: {
        requests.push({ body, url });

        return new Response(null, { status: 200 });
      }
      case discovery.token_endpoint: {
        requests.push({ body, url });

        return answerToken();
      }
      case discovery.userinfo_endpoint: {
        return Response.json({ email: 'ada@example.com', name: 'Ada', sub: 'user-42' });
      }
      default: {
        return new Response(null, { status: 404 });
      }
    }
  }));

  return {
    answerToken(answer: () => Promise<Response>) {
      answerToken = answer;
    },
    goDown() {
      isDown = true;
    },
    requests,
    revoked: () => requests.filter(request => request.url === discovery.revocation_endpoint).map(request => request.body.get('token')),
  };
}

function noTokenAnswer(): Promise<Response> {
  return Promise.reject(new Error('no token answer set'));
}

function tokens(refreshToken: string, options: { expiresIn?: number; nonce?: string } = {}): Promise<Response> {
  return Promise.resolve(Response.json({
    access_token: `access-for-${refreshToken}`,
    expires_in: options.expiresIn ?? 300,
    ...(options.nonce !== undefined && { id_token: idToken(options.nonce) }),
    refresh_token: refreshToken,
    token_type: 'Bearer',
  }));
}

/**
An unsigned ID token: from the token endpoint, oauth4webapi validates its claims only.
*/
function idToken(nonce: string): string {
  const now = Math.floor(Date.now() / 1000);

  return [
    base64url({ alg: 'RS256', typ: 'JWT' }),
    base64url({ aud: CLIENT_ID, exp: now + 300, iat: now, iss: ISSUER, nonce, sub: 'user-42' }),
    'signature',
  ].join('.');
}

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function callback(state: string): string {
  return `${ORIGIN}/auth/callback?code=the-code&state=${state}`;
}

function newOwner(): SessionOwner {
  return new SessionOwner({ clientId: CLIENT_ID, issuer: ISSUER }, ORIGIN);
}

async function loggedIn(provider: ReturnType<typeof fakeProvider>, expiresIn = 300) {
  const owner = newOwner();
  const { pending } = await owner.beginLogin('/products');

  provider.answerToken(() => tokens('refresh-1', { expiresIn, nonce: pending.nonce }));
  await owner.completeLogin(callback(pending.state), pending);
  provider.requests.length = 0;

  const views: (SessionView | null)[] = [];

  owner.subscribe((view) => {
    views.push(view);
  });

  return { owner, views };
}

let provider: ReturnType<typeof fakeProvider>;

beforeEach(() => {
  provider = fakeProvider();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('logs in with the code the provider sends back, and tells the tabs who, not the tokens', async () => {
  const owner = newOwner();
  const { pending, url } = await owner.beginLogin('/products');
  const authorize = new URL(url);

  expect(`${authorize.origin}${authorize.pathname}`).toBe(discovery.authorization_endpoint);
  expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
    client_id: CLIENT_ID,
    code_challenge_method: 'S256',
    nonce: pending.nonce,
    redirect_uri: `${ORIGIN}/auth/callback`,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state: pending.state,
  });

  provider.answerToken(() => tokens('refresh-1', { nonce: pending.nonce }));

  await expect(owner.completeLogin(callback(pending.state), pending)).resolves.toBe('/products');
  expect(provider.requests[0]?.body.get('code_verifier')).toBe(pending.codeVerifier);

  const views: (SessionView | null)[] = [];

  owner.subscribe((view) => {
    views.push(view);
  });

  expect(views).toEqual([{
    expiresAt: expect.any(Number) as number,
    user: { email: 'ada@example.com', name: 'Ada', subject: 'user-42' },
  }]);
  await expect(owner.accessToken()).resolves.toBe('access-for-refresh-1');
});

it('refuses a callback that answers some other login', async () => {
  const owner = newOwner();
  const { pending } = await owner.beginLogin('/products');

  await expect(owner.completeLogin(callback('forged'), pending)).rejects.toThrow();
  expect(provider.requests).toHaveLength(0);
});

it('hands out a fresh access token without asking the provider', async () => {
  const { owner } = await loggedIn(provider);

  await expect(owner.accessToken()).resolves.toBe('access-for-refresh-1');
  expect(provider.requests).toHaveLength(0);
});

it('renews a token about to expire once, however many tabs wait for it, and tells them all', async () => {
  const { owner, views } = await loggedIn(provider, 10);

  provider.answerToken(() => tokens('refresh-2'));

  const renewed = await Promise.all([owner.accessToken(), owner.accessToken(), owner.accessToken()]);

  expect(renewed).toEqual(['access-for-refresh-2', 'access-for-refresh-2', 'access-for-refresh-2']);
  expect(provider.requests.map(request => request.body.get('refresh_token'))).toEqual(['refresh-1']);
  expect(views).toHaveLength(2);
  expect(views[1]?.expiresAt).toBeGreaterThan(Date.now() + 60_000);
});

it('ends the session for every tab when the provider refuses to renew', async () => {
  const { owner, views } = await loggedIn(provider, 10);

  provider.answerToken(() => Promise.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 })));

  await expect(owner.accessToken()).resolves.toBeNull();
  expect(views.at(-1)).toBeNull();
});

it('keeps the session when the renewal does not reach the provider', async () => {
  const { owner, views } = await loggedIn(provider, 10);

  provider.goDown();

  await expect(owner.accessToken()).rejects.toThrow();
  expect(views).toHaveLength(1);
});

it('on logout, revokes the refresh token and sends the user to end the provider\'s session', async () => {
  const { owner, views } = await loggedIn(provider);

  const endSession = new URL(await owner.logout());

  expect(provider.revoked()).toEqual(['refresh-1']);
  expect(`${endSession.origin}${endSession.pathname}`).toBe(discovery.end_session_endpoint);
  expect(Object.fromEntries(endSession.searchParams)).toEqual({
    client_id: CLIENT_ID,
    id_token_hint: expect.any(String) as string,
    post_logout_redirect_uri: `${ORIGIN}/`,
  });
  expect(views.at(-1)).toBeNull();
});

it('ends the session on logout even when the provider cannot be reached', async () => {
  const { owner, views } = await loggedIn(provider);

  provider.goDown();

  await expect(owner.logout()).resolves.toContain(discovery.end_session_endpoint);
  expect(views.at(-1)).toBeNull();
});

it('does not let a renewal that lands after logout bring the session back', async () => {
  const { owner, views } = await loggedIn(provider, 10);
  const landing = Promise.withResolvers<Response>();

  provider.answerToken(() => landing.promise);

  const renewal = owner.accessToken();

  await vi.waitFor(() => {
    expect(provider.requests).toHaveLength(1);
  });
  await owner.logout();
  landing.resolve(await tokens('refresh-2'));

  await expect(renewal).resolves.toBeNull();
  expect(views.at(-1)).toBeNull();
  expect(provider.revoked()).toEqual(['refresh-1', 'refresh-2']);
});

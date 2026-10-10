import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { APP_CONFIG } from '../config/app-config';
import { Auth, SESSION_PORT } from './auth';
import { type PendingLogin, serveSession, type SessionSource, type SessionView } from './session/session-protocol';

const PENDING: PendingLogin = { codeVerifier: 'verifier', nonce: 'nonce', returnTo: '/products', state: 'state' };
const AUTHORIZE = 'http://localhost:8080/oauth/v2/authorize?state=state';
const END_SESSION = 'http://localhost:8080/oidc/v1/end_session';
const ADA: SessionView = { user: { name: 'Ada', subject: 'user-42' } };

/**
 * A stand-in for the session's owner, served over a real port as the worker serves it.
 */
function fakeOwner(session: SessionView | null) {
  const listeners = new Set<(view: SessionView | null, loggedOut: boolean) => void>();
  const owner = {
    accessToken: vi.fn(() => Promise.resolve<string | null>('access-token')),
    beginLogin: vi.fn((returnTo: string) => Promise.resolve({ pending: { ...PENDING, returnTo }, url: AUTHORIZE })),
    completeLogin: vi.fn((_callback: string, pending: PendingLogin) => Promise.resolve(pending.returnTo)),
    logout: vi.fn(() => {
      emit(null, true);

      return Promise.resolve(END_SESSION);
    }),
    subscribe(listener: (view: SessionView | null, loggedOut: boolean) => void) {
      listeners.add(listener);
      listener(session, false);

      return () => listeners.delete(listener);
    },
  } satisfies SessionSource;

  function emit(view: SessionView | null, loggedOut = false): void {
    session = view;

    for (const listener of listeners) {
      listener(view, loggedOut);
    }
  }

  return { emit, owner };
}

async function openTab(owner: SessionSource) {
  const channel = new MessageChannel();
  const location = { assign: vi.fn(), pathname: '/products', search: '?page=2' };

  serveSession(channel.port2, () => owner);
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://localhost:3000', clientId: 'admin', issuer: 'http://localhost:8080' } },
      { provide: DOCUMENT, useValue: { location } },
      { provide: SESSION_PORT, useValue: channel.port1 },
    ],
  });

  const auth = TestBed.inject(Auth);

  await auth.ready;

  return { auth, location };
}

beforeEach(() => {
  sessionStorage.clear();
});

it('starts once the worker has said whether there is a session', async () => {
  const { auth } = await openTab(fakeOwner(ADA).owner);

  expect(auth.session()).toEqual(ADA);
  expect(auth.isAuthenticated()).toBe(true);
});

it('leaves to log in carrying what the worker hands it', async () => {
  const { owner } = fakeOwner(null);
  const { auth, location } = await openTab(owner);

  await auth.login('/products?page=2');

  expect(owner.beginLogin).toHaveBeenCalledWith('/products?page=2');
  expect(JSON.parse(sessionStorage.getItem('trastienda.pending-login') ?? 'null')).toEqual({ ...PENDING, returnTo: '/products?page=2' });
  expect(location.assign).toHaveBeenCalledWith(AUTHORIZE);
});

it('completes the login with what it carried, and only once', async () => {
  const { owner } = fakeOwner(null);
  const { auth } = await openTab(owner);
  const callback = new URL('http://localhost:4200/auth/callback?code=the-code&state=state');

  sessionStorage.setItem('trastienda.pending-login', JSON.stringify(PENDING));

  await expect(auth.completeLogin(callback)).resolves.toBe('/products');
  expect(owner.completeLogin).toHaveBeenCalledWith(callback.href, PENDING);
  await expect(auth.completeLogin(callback)).rejects.toThrow('no login was started in this tab');
});

it('refuses a stored login it cannot read back, without asking the worker', async () => {
  const { owner } = fakeOwner(null);
  const { auth } = await openTab(owner);

  sessionStorage.setItem('trastienda.pending-login', JSON.stringify({ ...PENDING, nonce: undefined }));

  await expect(auth.completeLogin(new URL('http://localhost:4200/auth/callback'))).rejects.toThrow('cannot be read back');
  expect(owner.completeLogin).not.toHaveBeenCalled();
});

it('logs in again, back to the same page, when the provider refuses to renew', async () => {
  const { emit, owner } = fakeOwner(ADA);
  const { auth, location } = await openTab(owner);

  emit(null);

  await vi.waitFor(() => {
    expect(location.assign).toHaveBeenCalledWith(AUTHORIZE);
  });
  expect(owner.beginLogin).toHaveBeenCalledWith('/products?page=2');
  expect(auth.isAuthenticated()).toBe(false);
});

it('goes to the logged-out page, without logging in, when another tab logs out', async () => {
  const { emit, owner } = fakeOwner(ADA);
  const { auth, location } = await openTab(owner);

  emit(null, true);

  await vi.waitFor(() => {
    expect(location.assign).toHaveBeenCalledWith('/logged-out');
  });
  expect(owner.beginLogin).not.toHaveBeenCalled();
  expect(auth.isAuthenticated()).toBe(false);
});

it('leaves to end the provider\'s session on logout, and does not log in again', async () => {
  const { owner } = fakeOwner(ADA);
  const { auth, location } = await openTab(owner);

  await auth.logout();

  expect(location.assign).toHaveBeenCalledExactlyOnceWith(END_SESSION);
  expect(owner.beginLogin).not.toHaveBeenCalled();
});

it('still leaves for the logged-out page when the worker cannot end the provider\'s session', async () => {
  const { emit, owner } = fakeOwner(ADA);
  const { auth, location } = await openTab(owner);

  owner.logout.mockImplementationOnce(() => {
    emit(null, true);

    return Promise.reject(new Error('the identity provider publishes no end_session_endpoint'));
  });

  await expect(auth.logout()).resolves.toBeUndefined();
  expect(location.assign).toHaveBeenCalledExactlyOnceWith('/logged-out');
  expect(owner.beginLogin).not.toHaveBeenCalled();
});

it('passes on what the worker fails with', async () => {
  const { owner } = fakeOwner(ADA);

  owner.accessToken.mockRejectedValue(new TypeError('Failed to fetch'));

  const { auth } = await openTab(owner);

  await expect(auth.accessToken()).rejects.toThrow('Failed to fetch');
});

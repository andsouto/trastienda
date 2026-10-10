import { DOCUMENT } from '@angular/common';
import { computed, inject, InjectionToken, Service, signal } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import { LOGGED_OUT_PATH, type PendingLogin, SessionClient, type SessionView } from './session/session-protocol';

/**
 * The port to the session's owner: the shared worker, in the app.
 */
export const SESSION_PORT = new InjectionToken<MessagePort>('SESSION_PORT', {
  factory: connectSessionWorker,
});

// Per tab: what the login carries to the provider and back.
const PENDING_LOGIN_KEY = 'trastienda.pending-login';

/**
 * This tab's side of the session, which a shared worker owns for every tab
 * (session/): the redirects, which only a tab can make, and what the worker
 * says of the session. No token is kept here.
 */
@Service()
export class Auth {
  readonly #client: SessionClient;
  readonly #document = inject(DOCUMENT);
  readonly #session = signal<SessionView | null>(null);
  #isLeaving = false;

  readonly isAuthenticated = computed(() => this.#session() !== null);

  /**
   * The session as the worker first tells it: the app waits for it to start.
   */
  readonly ready: Promise<SessionView | null>;
  readonly session = this.#session.asReadonly();

  constructor() {
    const started = Promise.withResolvers<SessionView | null>();
    const { clientId, issuer } = inject(APP_CONFIG);

    this.ready = started.promise;
    this.#client = new SessionClient(inject(SESSION_PORT), { clientId, issuer }, (session, loggedOut) => {
      this.#update(session, loggedOut);
      started.resolve(session);
    });
  }

  /**
   * A valid access token, or null without a session. When the provider
   * refuses to renew it, the session ends in every tab and each logs in again.
   */
  async accessToken(): Promise<string | null> {
    return this.#client.call('accessToken');
  }

  /**
   * Leaves for the provider's login page; the provider sends the user back to the callback.
   */
  async login(returnTo: string): Promise<void> {
    const { pending, url } = await this.#client.call('beginLogin', returnTo);

    sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));
    this.#document.location.assign(url);
  }

  /**
   * Hands the provider's answer to the worker, and says where the user was going.
   */
  async completeLogin(callback: URL): Promise<string> {
    const stored = sessionStorage.getItem(PENDING_LOGIN_KEY);

    sessionStorage.removeItem(PENDING_LOGIN_KEY);

    if (stored === null) {
      throw new Error('no login was started in this tab');
    }

    return this.#client.call('completeLogin', callback.href, parsePendingLogin(stored));
  }

  async logout(): Promise<void> {
    // This tab is leaving to end the provider's session: the end of the
    // session here is not a reason to log in again.
    this.#isLeaving = true;

    try {
      this.#document.location.assign(await this.#client.call('logout'));
    } catch {
      // The worker ends the session before anything that can fail, so this tab
      // is logged out all the same; only the provider's own session remains.
      this.#document.location.assign(LOGGED_OUT_PATH);
    }
  }

  /**
   * Takes the session as the worker announces it. When it ends from elsewhere,
   * a refused renewal logs in again and comes back here. Another tab's logout
   * leaves for the logged-out page instead: logging in from here could reach
   * the provider before that tab ends its session there, and open a new one.
   */
  #update(session: SessionView | null, loggedOut: boolean): void {
    const hasEnded = this.#session() !== null && session === null;

    this.#session.set(session);

    if (!hasEnded || this.#isLeaving) {
      return;
    }

    if (loggedOut) {
      this.#document.location.assign(LOGGED_OUT_PATH);
    } else {
      void this.login(this.#document.location.pathname + this.#document.location.search);
    }
  }
}

/**
 * What login() stored before leaving, checked rather than trusted: the page
 * can change sessionStorage, and a deploy can land between leaving and coming
 * back.
 */
function parsePendingLogin(stored: string): PendingLogin {
  const value: unknown = JSON.parse(stored);

  if (
    typeof value !== 'object' || value === null
    || !('codeVerifier' in value) || typeof value.codeVerifier !== 'string'
    || !('nonce' in value) || typeof value.nonce !== 'string'
    || !('returnTo' in value) || typeof value.returnTo !== 'string'
    || !('state' in value) || typeof value.state !== 'string'
  ) {
    throw new TypeError('the login this tab started cannot be read back');
  }

  return { codeVerifier: value.codeVerifier, nonce: value.nonce, returnTo: value.returnTo, state: value.state };
}

/**
 * The worker lives while a tab of the admin does. extendedLifetime, where the
 * browser has it, keeps it through a reload of the last one; elsewhere that
 * reload goes through the provider's login, which its own session answers
 * with a redirect back.
 */
function connectSessionWorker(): MessagePort {
  if (typeof SharedWorker === 'undefined') {
    throw new TypeError('this browser has no SharedWorker, which the admin keeps its session in');
  }

  // The URL as a literal next to import.meta.url, the only form Angular's
  // builder recognises and bundles as a worker.
  const worker = new SharedWorker(new URL('session/session.worker', import.meta.url), {
    // @ts-expect-error TypeScript's DOM types lack extendedLifetime.
    extendedLifetime: true,
    type: 'module',
  });

  // Without its worker the app never starts: say why.
  worker.addEventListener('error', () => {
    console.error('the session worker failed to start');
  });

  return worker.port;
}

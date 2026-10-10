import { DOCUMENT } from '@angular/common';
import { computed, inject, InjectionToken, Service, signal } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import { type PendingLogin, type SessionMethods, type SessionView } from './session-owner';
import { type Hello, type Reply, type Update } from './session-port';

/**
The port to the session's owner: the shared worker, in the app.
*/
export const SESSION_PORT = new InjectionToken<MessagePort>('SESSION_PORT', {
  factory: connectSessionWorker,
});

// Per tab: what the login carries to the provider and back.
const PENDING_LOGIN_KEY = 'trastienda.pending-login';

/**
 * This tab's side of the session, which a shared worker owns for every tab
 * (session-owner.ts): the redirects, which only a tab can make, and what the
 * worker says of the session. No token is kept here.
 */
@Service()
export class Auth {
  readonly #document = inject(DOCUMENT);
  readonly #port = inject(SESSION_PORT);
  readonly #replies = new Map<number, { reject: (error: Error) => void; resolve: (result: unknown) => void }>();
  readonly #session = signal<SessionView | null>(null);
  #isLeaving = false;
  #lastCall = 0;

  readonly isAuthenticated = computed(() => this.#session() !== null);
  /**
  The session as the worker first tells it: the app waits for it to start.
  */
  readonly ready: Promise<SessionView | null>;
  readonly session = this.#session.asReadonly();

  constructor() {
    const started = Promise.withResolvers<SessionView | null>();

    this.ready = started.promise;
    this.#port.addEventListener('message', (event: MessageEvent<Reply | Update>) => {
      const message = event.data;

      if ('id' in message) {
        this.#settle(message);
      } else {
        this.#update(message.session);
        started.resolve(message.session);
      }
    });
    this.#port.start();

    const { clientId, issuer } = inject(APP_CONFIG);

    this.#port.postMessage({ config: { clientId, issuer } } satisfies Hello);
  }

  async #call<M extends keyof SessionMethods>(
    method: M,
    ...parameters: Parameters<SessionMethods[M]>
  ): Promise<Awaited<ReturnType<SessionMethods[M]>>> {
    this.#lastCall += 1;

    const id = this.#lastCall;
    const reply = Promise.withResolvers<unknown>();

    this.#replies.set(id, reply);
    this.#port.postMessage({ id, method, parameters });

    return await reply.promise as Awaited<ReturnType<SessionMethods[M]>>;
  }

  #settle(reply: Reply): void {
    const pending = this.#replies.get(reply.id);

    this.#replies.delete(reply.id);

    if ('error' in reply) {
      pending?.reject(new Error(reply.error));
    } else {
      pending?.resolve(reply.result);
    }
  }

  #update(session: SessionView | null): void {
    const hasEnded = this.#session() !== null && session === null;

    this.#session.set(session);

    // Ended from elsewhere (another tab's logout, or the provider refusing a
    // renewal): log in again, and come back here.
    if (hasEnded && !this.#isLeaving) {
      void this.login(this.#document.location.pathname + this.#document.location.search);
    }
  }

  /**
   * A valid access token, or null without a session. When the provider
   * refuses to renew it, the session ends in every tab and each logs in again.
   */
  async accessToken(): Promise<string | null> {
    return this.#call('accessToken');
  }

  /**
  Leaves for the provider's login page; the provider sends the user back to the callback.
  */
  async login(returnTo: string): Promise<void> {
    const { pending, url } = await this.#call('beginLogin', returnTo);

    sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));
    this.#document.location.assign(url);
  }

  /**
  Hands the provider's answer to the worker, and says where the user was going.
  */
  async completeLogin(callback: URL): Promise<string> {
    const stored = sessionStorage.getItem(PENDING_LOGIN_KEY);

    sessionStorage.removeItem(PENDING_LOGIN_KEY);

    if (stored === null) {
      throw new Error('no login was started in this tab');
    }

    return this.#call('completeLogin', callback.href, JSON.parse(stored) as PendingLogin);
  }

  async logout(): Promise<void> {
    // This tab is leaving to end the provider's session: the end of the
    // session here is not a reason to log in again.
    this.#isLeaving = true;
    this.#document.location.assign(await this.#call('logout'));
  }
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

  // Inline, for bundlers to see; TypeScript's DOM types lack extendedLifetime.
  const worker = new SharedWorker(
    new URL('session.worker', import.meta.url),
    { extendedLifetime: true, type: 'module' } as WorkerOptions,
  );

  // Without its worker the app never starts: say why.
  worker.addEventListener('error', () => {
    console.error('the session worker failed to start');
  });

  return worker.port;
}

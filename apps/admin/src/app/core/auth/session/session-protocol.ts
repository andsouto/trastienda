/**
 * Where every tab ends up after a logout: the one that logged out, back from the
 * provider, and the others straight away.
 */
export const LOGGED_OUT_PATH = '/logged-out';

/**
 * What a tab knows of the session: who is logged in, never the tokens.
 */
export interface SessionView {
  /**
   * Epoch milliseconds the access token is good until; absent when the provider did not say.
   */
  expiresAt?: number;

  /**
   * From the provider's userinfo endpoint, at login.
   */
  user: { email?: string; name?: string; subject: string };
}

/**
 * What a login carries across the redirect to the provider and back. The tab
 * that leaves keeps it, since the worker may not outlive the redirect, but
 * only the owner reads it.
 */
export interface PendingLogin {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  state: string;
}

/**
 * What the owner does for the tabs, each call a message from one of them.
 */
export interface SessionMethods {
  /**
   * A valid access token, renewed first when it is about to expire, or null
   * without a session. When the provider refuses to renew it the session is
   * over, and every tab hears so.
   */
  accessToken(): Promise<string | null>;

  /**
   * Where to send the user to log in, and what to carry until they come back.
   */
  beginLogin(returnTo: string): Promise<{ pending: PendingLogin; url: string }>;

  /**
   * Trades the code in the callback URL for tokens, and says where the user was going.
   */
  completeLogin(callback: string, pending: PendingLogin): Promise<string>;

  /**
   * Ends the session here and at the provider, and says where to send the user to finish.
   */
  logout(): Promise<string>;
}

/**
 * What the worker serves to the tabs: the owner's methods, and its changes.
 */
export interface SessionSource extends SessionMethods {
  /**
   * Calls the listener with the session now and on every change; returns how to stop.
   * `loggedOut` says the session ended because someone logged out.
   */
  subscribe(listener: (session: SessionView | null, loggedOut: boolean) => void): () => void;
}

/**
 * What the owner needs to talk to the identity provider: the first tab sends it.
 */
export interface SessionConfig {
  clientId: string;
  issuer: string;
}

/**
 * The first message on a port: the config the owner is built from, if it is the first tab.
 */
export interface Hello {
  config: SessionConfig;
}

/**
 * A tab calling one of the owner's methods.
 */
export type Call = {
  [M in keyof SessionMethods]: { id: number; method: M; parameters: Parameters<SessionMethods[M]> };
}[keyof SessionMethods];

/**
 * The owner answering a call; errors travel as their message.
 */
export type Reply = { error: string; id: number } | { id: number; result: unknown };

/**
 * The owner telling a tab the session changed, and what it is now on connecting.
 */
export interface Update {
  /**
   * The session ended because a tab logged out, rather than because the provider refused to renew it.
   */
  loggedOut: boolean;

  session: SessionView | null;
}

/**
 * The tab's end of the port: says hello, calls the owner's methods as if they
 * were its own, and hands every update to `onUpdate`.
 */
export class SessionClient {
  readonly #port: MessagePort;
  readonly #replies = new Map<number, { reject: (error: Error) => void; resolve: (result: unknown) => void }>();
  #lastCall = 0;

  constructor(port: MessagePort, config: SessionConfig, onUpdate: (session: SessionView | null, loggedOut: boolean) => void) {
    this.#port = port;
    port.addEventListener('message', (event: MessageEvent<Reply | Update>) => {
      const message = event.data;

      if ('id' in message) {
        this.#settle(message);
      } else {
        onUpdate(message.session, message.loggedOut);
      }
    });
    port.start();
    port.postMessage({ config } satisfies Hello);
  }

  /**
   * Calls one of the owner's methods, typed as the method itself. A port only
   * carries messages, so each call gets an id, and #settle matches the reply
   * that brings it back. The reply has the method's type because a tab only
   * talks to a worker built from the same code: the worker's URL is a hash of it.
   */
  async call<M extends keyof SessionMethods>(
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

  /**
   * Resolves or rejects the call a reply answers. An error crosses the port
   * as its message only, so it comes back as a plain Error.
   */
  #settle(reply: Reply): void {
    const pending = this.#replies.get(reply.id);

    this.#replies.delete(reply.id);

    if ('error' in reply) {
      pending?.reject(new Error(reply.error));
    } else {
      pending?.resolve(reply.result);
    }
  }
}

/**
 * The worker's end of one tab's port: builds the owner from the tab's hello,
 * through `ownerFor`, keeps the tab up to date, and answers its calls.
 */
export function serveSession(port: MessagePort, ownerFor: (config: SessionConfig) => SessionSource): void {
  let owner: SessionSource | undefined;

  port.addEventListener('message', (event: MessageEvent<Call | Hello>) => {
    const message = event.data;

    if ('config' in message) {
      owner ??= ownerFor(message.config);
      owner.subscribe((session, loggedOut) => {
        port.postMessage({ loggedOut, session } satisfies Update);
      });
    } else if (owner !== undefined) {
      void answer(port, owner, message);
    }
  });
  port.start();
}

async function answer(port: MessagePort, owner: SessionSource, call: Call): Promise<void> {
  try {
    port.postMessage({ id: call.id, result: await dispatch(owner, call) } satisfies Reply);
  } catch (error) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error), id: call.id } satisfies Reply);
  }
}

function dispatch(owner: SessionMethods, call: Call): Promise<unknown> {
  switch (call.method) {
    case 'accessToken': {
      return owner.accessToken();
    }
    case 'beginLogin': {
      return owner.beginLogin(...call.parameters);
    }
    case 'completeLogin': {
      return owner.completeLogin(...call.parameters);
    }
    case 'logout': {
      return owner.logout();
    }
  }
}

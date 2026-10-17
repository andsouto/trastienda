import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import * as oauth from 'oauth4webapi';

import { APP_CONFIG } from '../config/app-config';

export interface Session {
  accessToken: string;
  /**
  Epoch milliseconds; absent when the provider did not say.
  */
  expiresAt?: number;
  /**
  Sent back to the provider on logout, so it knows which session to end.
  */
  idToken: string;
  refreshToken?: string;
  /**
  From the provider's userinfo endpoint, at login.
  */
  user: { email?: string; name?: string; subject: string };
}

interface PendingLogin {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  state: string;
}

export const CALLBACK_PATH = '/auth/callback';
// The ID token's identity claims, and a refresh token.
const SCOPE = 'openid profile email offline_access';
// Renew this long before expiry, so no request leaves with a token that dies on
// the way.
const EXPIRY_MARGIN_MS = 30_000;
// Per tab: a new tab logs in again, which with the provider's own session is a
// redirect and back.
const SESSION_KEY = 'trastienda.session';
const PENDING_LOGIN_KEY = 'trastienda.pending-login';

/**
 * The OIDC client: authorization code flow with PKCE against the provider in
 * the runtime config, and the session it yields. oauth4webapi does the
 * protocol and its validations (ADR-0008); this does the redirects and keeps
 * the tokens.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly #config = inject(APP_CONFIG);
  readonly #document = inject(DOCUMENT);
  readonly #client: oauth.Client = { client_id: this.#config.clientId };
  readonly #issuer = new URL(this.#config.issuer);
  readonly #redirectUri = new URL(CALLBACK_PATH, this.#document.location.origin).href;
  /**
   * oauth4webapi refuses plain http, and only a provider on localhost is let
   * off: the development Zitadel has no TLS.
   */
  readonly #requestOptions = {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated only to stand out: see above
    [oauth.allowInsecureRequests]: this.#issuer.protocol === 'http:' && this.#issuer.hostname === 'localhost',
  };

  readonly #session = signal(readStored(SESSION_KEY) as Session | null);
  #authorizationServer: Promise<oauth.AuthorizationServer> | undefined;
  #refreshing: Promise<Session | null> | undefined;

  readonly session = this.#session.asReadonly();
  readonly isAuthenticated = computed(() => this.#session() !== null);

  async #refreshOnce(session: Session): Promise<Session | null> {
    try {
      return await this.#refresh(session);
    } finally {
      this.#refreshing = undefined;
    }
  }

  async #refresh(session: Session): Promise<Session | null> {
    if (session.refreshToken !== undefined) {
      const server = await this.#discover();

      try {
        const response = await oauth.refreshTokenGrantRequest(
          server,
          this.#client,
          oauth.None(),
          session.refreshToken,
          this.#requestOptions,
        );
        const renewed = {
          ...session,
          ...fromTokenResponse(await oauth.processRefreshTokenResponse(server, this.#client, response)),
        };

        this.#store(renewed);

        return renewed;
      } catch (error) {
        // Only the provider's refusal ends the session: a failed request (a
        // dropped connection, say) leaves it for the next try.
        if (!(error instanceof oauth.ResponseBodyError)) {
          throw error;
        }
      }
    }

    this.#store(null);
    await this.login(this.#document.location.pathname + this.#document.location.search);

    return null;
  }

  /**
  Discovery once per page load; a failed one is not cached.
  */
  async #discover(): Promise<oauth.AuthorizationServer> {
    this.#authorizationServer ??= this.#fetchDiscovery();

    try {
      return await this.#authorizationServer;
    } catch (error) {
      this.#authorizationServer = undefined;
      throw error;
    }
  }

  async #fetchDiscovery(): Promise<oauth.AuthorizationServer> {
    const response = await oauth.discoveryRequest(this.#issuer, this.#requestOptions);

    return oauth.processDiscoveryResponse(this.#issuer, response);
  }

  #store(session: Session | null): void {
    this.#session.set(session);

    if (session === null) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }

  /**
  Leaves for the provider's login page; the provider sends the user back to the callback.
  */
  async login(returnTo: string): Promise<void> {
    const server = await this.#discover();
    const pending: PendingLogin = {
      codeVerifier: oauth.generateRandomCodeVerifier(),
      // Every ID token this client holds carries a nonce, which is also what
      // the API refuses an ID token by (ADR-0008).
      nonce: oauth.generateRandomNonce(),
      returnTo,
      state: oauth.generateRandomState(),
    };

    sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));

    const url = new URL(endpoint(server.authorization_endpoint, 'authorization_endpoint'));

    url.search = new URLSearchParams({
      client_id: this.#config.clientId,
      code_challenge: await oauth.calculatePKCECodeChallenge(pending.codeVerifier),
      code_challenge_method: 'S256',
      nonce: pending.nonce,
      redirect_uri: this.#redirectUri,
      response_type: 'code',
      scope: SCOPE,
      state: pending.state,
    }).toString();

    this.#document.location.assign(url);
  }

  /**
  Trades the code the provider sent back for tokens, and says where the user was going.
  */
  async completeLogin(callback: URL): Promise<string> {
    const pending = readStored(PENDING_LOGIN_KEY) as PendingLogin | null;

    sessionStorage.removeItem(PENDING_LOGIN_KEY);

    if (pending === null) {
      throw new Error('no login was started in this tab');
    }

    const server = await this.#discover();
    const parameters = oauth.validateAuthResponse(server, this.#client, callback, pending.state);
    const response = await oauth.authorizationCodeGrantRequest(
      server,
      this.#client,
      oauth.None(),
      parameters,
      this.#redirectUri,
      pending.codeVerifier,
      this.#requestOptions,
    );
    const result = await oauth.processAuthorizationCodeResponse(server, this.#client, response, {
      expectedNonce: pending.nonce,
      requireIdToken: true,
    });

    const { idToken, ...tokens } = fromTokenResponse(result);
    const claims = oauth.getValidatedIdTokenClaims(result);

    // requireIdToken already makes oauth4webapi refuse a response without one.
    if (idToken === undefined || claims === undefined) {
      throw new Error('the identity provider sent no ID token');
    }

    // Name and email come from userinfo: with an access token issued, OpenID
    // Connect keeps them out of the ID token, which lives in the browser.
    const userInfo = await oauth.processUserInfoResponse(
      server,
      this.#client,
      claims.sub,
      await oauth.userInfoRequest(server, this.#client, tokens.accessToken, this.#requestOptions),
    );

    this.#store({
      ...tokens,
      idToken,
      user: {
        ...(userInfo.email !== undefined && { email: userInfo.email }),
        ...(userInfo.name !== undefined && { name: userInfo.name }),
        subject: claims.sub,
      },
    });

    return pending.returnTo;
  }

  /**
   * A valid access token, renewed first when it is about to expire, or null
   * without a session. When the provider refuses to renew it the session is
   * over, and the user is sent to log in again.
   */
  async accessToken(): Promise<string | null> {
    const session = this.#session();

    if (session === null) {
      return null;
    }

    if (session.expiresAt === undefined || session.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
      return session.accessToken;
    }

    // Concurrent requests share one renewal: a refresh token is single use.
    this.#refreshing ??= this.#refreshOnce(session);

    const renewed = await this.#refreshing;

    return renewed?.accessToken ?? null;
  }

  async logout(): Promise<void> {
    const session = this.#session();

    // First, so the session ends here even if the provider cannot be reached.
    this.#store(null);

    const server = await this.#discover();

    const url = new URL(endpoint(server.end_session_endpoint, 'end_session_endpoint'));

    url.search = new URLSearchParams({
      client_id: this.#config.clientId,
      post_logout_redirect_uri: new URL('/', this.#document.location.origin).href,
      ...(session && { id_token_hint: session.idToken }),
    }).toString();

    this.#document.location.assign(url);
  }
}

/**
 * The tokens a token response carries. A refresh may leave out the ID token
 * and the refresh token, which then stay as they were.
 */
function fromTokenResponse(
  result: oauth.TokenEndpointResponse,
): Pick<Session, 'accessToken'> & Partial<Pick<Session, 'expiresAt' | 'idToken' | 'refreshToken'>> {
  return {
    accessToken: result.access_token,
    ...(result.expires_in !== undefined && { expiresAt: Date.now() + result.expires_in * 1000 }),
    ...(result.id_token !== undefined && { idToken: result.id_token }),
    ...(result.refresh_token !== undefined && { refreshToken: result.refresh_token }),
  };
}

function endpoint(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`the identity provider publishes no ${name}`);
  }

  return value;
}

function readStored(key: string): unknown {
  const stored = sessionStorage.getItem(key);

  return stored === null ? null : JSON.parse(stored);
}

import * as oauth from 'oauth4webapi';

import { LOGGED_OUT_PATH, type PendingLogin, type SessionConfig, type SessionSource, type SessionView } from './session-protocol';

interface Session extends SessionView {
  accessToken: string;

  /**
   * Sent back to the provider on logout, so it knows which session to end.
   */
  idToken: string;
  refreshToken?: string;
}

const CALLBACK_PATH = '/auth/callback';
// The ID token's identity claims, and a refresh token: Zitadel issues one only
// for offline_access.
const SCOPE = 'openid profile email offline_access';
// Renew this long before expiry, so no request leaves with a token that dies on
// the way.
const EXPIRY_MARGIN_MS = 30_000;

/**
 * The OIDC client and the session it yields, for every tab of the admin at
 * once: authorization code flow with PKCE against the provider in the runtime
 * config. It runs in a shared worker, so the refresh token never leaves that
 * worker's memory; oauth4webapi does the protocol and its validations.
 */
export class SessionOwner implements SessionSource {
  readonly #client: oauth.Client;
  readonly #issuer: URL;
  readonly #listeners = new Set<(session: SessionView | null, loggedOut: boolean) => void>();
  readonly #origin: string;
  readonly #requestOptions: { [oauth.allowInsecureRequests]: boolean };
  #authorizationServer: Promise<oauth.AuthorizationServer> | undefined;
  #refreshing: Promise<Session | null> | undefined;
  #session: Session | null = null;

  constructor(config: SessionConfig, origin: string) {
    this.#client = { client_id: config.clientId };
    this.#issuer = new URL(config.issuer);
    this.#origin = origin;
    // oauth4webapi refuses plain http; only a provider on localhost is let off,
    // since the development Zitadel has no TLS.
    this.#requestOptions = {
      [oauth.allowInsecureRequests]: this.#issuer.protocol === 'http:' && this.#issuer.hostname === 'localhost',
    };
  }

  async accessToken(): Promise<string | null> {
    const session = this.#session;

    if (session === null) {
      return null;
    }

    if (session.expiresAt === undefined || session.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
      return session.accessToken;
    }

    // Concurrent requests share one renewal, from whichever tab: a refresh
    // token is single use.
    this.#refreshing ??= this.#refreshOnce(session);

    const renewed = await this.#refreshing;

    return renewed?.accessToken ?? null;
  }

  async beginLogin(returnTo: string): Promise<{ pending: PendingLogin; url: string }> {
    const server = await this.#discover();
    const pending: PendingLogin = {
      codeVerifier: oauth.generateRandomCodeVerifier(),
      // Every ID token this client holds carries a nonce, which is also what
      // the API refuses an ID token by.
      nonce: oauth.generateRandomNonce(),
      returnTo,
      state: oauth.generateRandomState(),
    };
    const url = new URL(endpoint(server.authorization_endpoint, 'authorization_endpoint'));

    url.search = new URLSearchParams({
      client_id: this.#client.client_id,
      code_challenge: await oauth.calculatePKCECodeChallenge(pending.codeVerifier),
      code_challenge_method: 'S256',
      nonce: pending.nonce,
      redirect_uri: this.#redirectUri,
      response_type: 'code',
      scope: SCOPE,
      state: pending.state,
    }).toString();

    return { pending, url: url.href };
  }

  async completeLogin(callback: string, pending: PendingLogin): Promise<string> {
    const server = await this.#discover();
    const parameters = oauth.validateAuthResponse(server, this.#client, new URL(callback), pending.state);
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
    // Connect keeps them out of the ID token.
    const userInfo = await oauth.processUserInfoResponse(
      server,
      this.#client,
      claims.sub,
      await oauth.userInfoRequest(server, this.#client, tokens.accessToken, this.#requestOptions),
    );
    // A login from another tab while this one was out logging in, say.
    const replaced = this.#session;

    this.#set({
      ...tokens,
      idToken,
      user: {
        ...(userInfo.email !== undefined && { email: userInfo.email }),
        ...(userInfo.name !== undefined && { name: userInfo.name }),
        subject: claims.sub,
      },
    });
    await this.#revoke(replaced);

    return pending.returnTo;
  }

  async logout(): Promise<string> {
    const session = this.#session;

    // First, so the session ends here even if the provider cannot be reached.
    this.#set(null, true);
    await this.#revoke(session);

    const server = await this.#discover();
    const url = new URL(endpoint(server.end_session_endpoint, 'end_session_endpoint'));

    url.search = new URLSearchParams({
      client_id: this.#client.client_id,
      post_logout_redirect_uri: new URL(LOGGED_OUT_PATH, this.#origin).href,
      ...(session && { id_token_hint: session.idToken }),
    }).toString();

    return url.href;
  }

  subscribe(listener: (session: SessionView | null, loggedOut: boolean) => void): () => void {
    this.#listeners.add(listener);
    listener(toView(this.#session), false);

    return () => this.#listeners.delete(listener);
  }

  get #redirectUri(): string {
    return new URL(CALLBACK_PATH, this.#origin).href;
  }

  /**
   * The renewal accessToken shares while it is on its way; once it settles,
   * the next expiry starts another.
   */
  async #refreshOnce(session: Session): Promise<Session | null> {
    try {
      return await this.#refresh(session);
    } finally {
      this.#refreshing = undefined;
    }
  }

  /**
   * Renews the session with its refresh token. Null when there is none or the
   * provider refuses it, which ends the session; a failed request throws and
   * leaves the session for the next try.
   */
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

        // A logout while the renewal was on its way: the new tokens must not
        // bring the session back, nor outlive it at the provider.
        if (this.#session !== session) {
          await this.#revoke(renewed);

          return null;
        }

        this.#set(renewed);

        return renewed;
      } catch (error) {
        // Only the provider refusing the refresh token (invalid_grant) ends the
        // session: anything else, a dropped connection or a provider answering
        // temporarily_unavailable, leaves it for the next try.
        if (!(error instanceof oauth.ResponseBodyError) || error.error !== 'invalid_grant') {
          throw error;
        }
      }
    }

    // Unless a logout or another login got there first.
    if (this.#session === session) {
      this.#set(null);
    }

    return null;
  }

  /**
   * Tells the provider the refresh token is no longer wanted (RFC 7009).
   * Zitadel only issues refresh tokens for offline_access, which by design
   * outlive the provider's session, and only their holder can revoke them.
   * Best effort: the session ends here either way.
   */
  async #revoke(session: Session | null): Promise<void> {
    if (session?.refreshToken === undefined) {
      return;
    }

    try {
      const server = await this.#discover();

      if (server.revocation_endpoint !== undefined) {
        await oauth.processRevocationResponse(await oauth.revocationRequest(
          server,
          this.#client,
          oauth.None(),
          session.refreshToken,
          { ...this.#requestOptions, additionalParameters: { token_type_hint: 'refresh_token' } },
        ));
      }
    } catch {
      // Unreachable or refused: the token is gone from here, and expires there.
    }
  }

  /**
   * Discovery once per worker; a failed one is not cached.
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

  #set(session: Session | null, loggedOut = false): void {
    this.#session = session;

    for (const listener of this.#listeners) {
      listener(toView(session), loggedOut);
    }
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

function toView(session: Session | null): SessionView | null {
  return session && {
    ...(session.expiresAt !== undefined && { expiresAt: session.expiresAt }),
    user: session.user,
  };
}

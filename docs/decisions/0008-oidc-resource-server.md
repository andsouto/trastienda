# ADR-0008: Provider-agnostic OIDC resource server; Zitadel as reference IdP

## Context

Auth is too critical to hand-roll. The product is self-hosted OSS: deployers must be
able to bring their own identity provider.

## Decision

- The API is an **OIDC resource server**: validates JWTs against the issuer's JWKS.
  Configuration is `OIDC_ISSUER_URL` + `OIDC_AUDIENCE` (JWKS discovery), plus
  `OIDC_TYPED_ACCESS_TOKENS=false` for a provider that does not type its access tokens.
- **Authorization lives in the app**: the IdP authenticates and at most provides a
  role claim; role→permission mapping is application code. Public catalog read
  endpoints are kept separate from management endpoints from day one (future shop).
- **Zitadel** is the reference/documented IdP and runs in the dev docker-compose
  (~200-400MB, Go, uses Postgres). Automated tests use a fake JWKS signing test
  tokens — no IdP container needed.

## Library: jose

`jose` (MIT, zero dependencies) verifies the tokens; `createRemoteJWKSet` handles the
key fetching, caching and rotation. Zero dependencies matters for a product that pins
every version and reviews every bump (ADR-0009), and being Web Crypto based it runs in
a browser too — which the offline till of ADR-0014 needs for chain hashing.

`@fastify/jwt` + `get-jwks` is the obvious counter-proposal and was rejected: it sells
`request.jwtVerify()` sugar over a hook we own anyway, and couples verification to
Fastify, so the verifier stops being a plain function testable without a web framework.

## The admin's client

The admin logs in with the authorization code flow and PKCE as a public client, through
`oauth4webapi` (zero dependencies, by the author of `jose`, OpenID certified as a relying
party), which does the protocol; the redirects, renewal and logout are the admin's own.

- **`angular-auth-oidc-client`**: slow to merge fixes, certified only for the implicit
  and config profiles, and its guard, interceptor and silent renew are parts we would
  replace.
- **`angular-oauth2-oidc`**: barely maintained, slow to support new Angular versions,
  and coordinates nothing across tabs.

A `SharedWorker` owns the session for every tab: it does every token exchange, renewal
and revocation, and the refresh token never leaves its memory; tabs get an access token
for each API request. One owner means one renewal for all tabs, since a refresh token is
single use, and a logout ends every tab's session. Against a script injected into the
page it is neither better nor worse: that script can ask for a token as the app does.

- **Per-tab sessions in `sessionStorage`**: two tabs renewing with one refresh token, as
  a duplicated tab does, leave one of them logged out.
- **`localStorage`** with a lock around renewal: the refresh token would outlive closing
  the browser.
- **`BroadcastChannel` over per-tab copies**: copies to keep in step, where one owner has
  nothing to synchronise.
- **A service worker**: stopped when idle, taking the tokens with it unless they go to
  disk.
- **The worker also making the API's requests**, so no tab sees the access token: an
  injected script could still have the worker make them, and it takes a transport of
  our own under Angular's `HttpClient`. DPoP is what makes a stolen token useless.

Zitadel issues refresh tokens only for `offline_access`, and they outlive its session:
ending it leaves them working, and only their holder can revoke them
([zitadel#12637](https://github.com/zitadel/zitadel/issues/12637)). So logout revokes
the refresh token (RFC 7009) before ending the provider's session. One left behind by
closing every tab without logging out lives until it expires, so a deployment keeps its
lifetime short too.

## Telling access tokens from ID tokens

An issuer signs ID tokens with the same keys as access tokens, and RFC 8725 requires
telling them apart. By default the API requires RFC 9068's `at+jwt` type on access
tokens, which is all a provider implementing it needs.

Zitadel types every token `JWT` and puts the API's audience in its ID tokens too, so
neither the type nor the audience tells them apart. With `OIDC_TYPED_ACCESS_TOKENS=false`
the API also refuses a token carrying `nonce`, `at_hash` or `c_hash`, the claims OpenID
Connect defines for ID tokens only. They are optional, so this holds only because
Zitadel puts `at_hash` in every ID token it issues with an access token: the project's
clients get only the code and refresh grants, never token exchange, which can mint an ID
token without it. If Zitadel comes to type its access tokens, the mode goes.

## Alternatives considered (for the maintainer's own deployment)

- Keycloak: most featureful, 1-2GB+ JVM — too heavy for cheap servers.
- Authentik: valid middle ground (~500-800MB Python stack).
- Authelia: superb footprint (<30MB) but a forward-auth portal, not a full IAM.

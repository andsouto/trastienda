# ADR-0008: Provider-agnostic OIDC resource server; Zitadel as reference IdP

## Context

Auth is too critical to hand-roll. The product is self-hosted OSS: deployers must be
able to bring their own identity provider.

## Decision

- The API is an **OIDC resource server**: validates JWTs against the issuer's JWKS.
  Configuration is just `OIDC_ISSUER_URL` + `OIDC_AUDIENCE` (JWKS discovery).
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

## Tokens verified locally

The API verifies JWT access tokens against the cached JWKS, with no call to the provider
per request. A revoked or leaked token therefore stays valid until it expires, which a
short access token lifetime bounds: five minutes in the development compose, the order a
deployment wants too, with the refresh token renewing the session.

- **Opaque tokens and introspection**, rejected: revocation takes effect at once, but the
  provider sits in every request (its latency, and its outage is the API's), the API
  needs credentials of its own to call it, and caching the answers brings the revocation
  window back.
- **A backend-for-frontend** holding the tokens server side, with only a session cookie
  in the browser, rejected for now: the IETF's guidance for browser-based apps ranks it
  the most secure option, but it is a stateful component with cookies and CSRF to
  defend, at odds with a till that has to sell offline. Being one more client of the
  API, it can be put in front later without changing the API.
- **Sender-constrained tokens (DPoP)** would make a stolen token useless, and
  `oauth4webapi` supports them, but Zitadel does not offer them.

## The admin's client: oauth4webapi

The admin logs in with the authorization code flow and PKCE as a public client, through
`oauth4webapi` (MIT, zero dependencies, by the author of `jose`, OpenID certified as a
relying party). It does the protocol and its validations; what is left is the admin's
own, in `core/auth/`: the redirects, the tokens in `sessionStorage`, renewal
with the refresh token shortly before the access token expires (one renewal shared by
concurrent requests, since a refresh token is single use), and logout. The token goes on
API requests from an interceptor, which ADR-0007 requires anyway. The user's name and
email come from the userinfo endpoint at login: with an access token issued, OpenID
Connect keeps them out of the ID token, so Zitadel's option to put them there is off.

`angular-auth-oidc-client` was the alternative: Angular-native and quicker to wire, but
fixes from its own contributors sit unmerged for months, its OpenID certification covers
only the implicit and config profiles, and its guard, interceptor and iframe-based silent
renew are parts we would replace or not use.

## Telling access tokens from ID tokens

An issuer signs ID tokens with the same keys as access tokens, and RFC 8725 §3.12
requires validation rules that tell the kinds apart. The standard way is RFC 9068's: an
access token is typed `at+jwt`, and a resource server refuses any other type. That is
what the API requires by default, and all a provider implementing RFC 9068 needs: Auth0
with its RFC 9068 token profile, or Keycloak (from 26.2) with the client's `at+jwt`
setting.

`OIDC_TYPED_ACCESS_TOKENS=false` is for a provider that does not type its access tokens.
The audience check then refuses ID tokens, as long as the provider keeps the API's
audience out of them, which OpenID Connect allows but does not require. Zitadel, the
reference IdP, fails both: every token it signs is typed `JWT`, and its ID tokens carry
the project ID, the audience the API checks, so a Zitadel ID token used to get through
`/me`. Moving the API to a project of its own does not help, since Zitadel puts an
audience requested by scope in the ID token too.

So in that mode the verifier also refuses a token carrying `nonce`, `at_hash` or
`c_hash`, the claims OpenID Connect defines for ID tokens only, or one explicitly typed
as another kind of JWT (`logout+jwt`, say). That is not the standard, since those claims
are optional, and it holds only because of how Zitadel issues ID tokens: it puts
`at_hash` in every ID token it issues alongside an access token, which covers the code
and refresh grants, the only ones the project's clients get. Token exchange can mint an
ID token with neither marker, so no client of the project gets that grant; and the admin
sends a `nonce` anyway. The development setup runs in this mode. If Zitadel comes to
type its access tokens, the mode goes; introspection would tell the kinds apart with any
provider, at the cost of the provider in every request.

## Alternatives considered (for the maintainer's own deployment)

- Keycloak: most featureful, 1-2GB+ JVM — too heavy for cheap servers.
- Authentik: valid middle ground (~500-800MB Python stack).
- Authelia: superb footprint (<30MB) but a forward-auth portal, not a full IAM.

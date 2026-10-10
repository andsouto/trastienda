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

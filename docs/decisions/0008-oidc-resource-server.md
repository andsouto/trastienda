# ADR-0008: Provider-agnostic OIDC resource server; Zitadel as reference IdP

- Status: accepted

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

## Alternatives considered (for the maintainer's own deployment)

- Keycloak: most featureful, 1-2GB+ JVM — too heavy for cheap servers.
- Authentik: valid middle ground (~500-800MB Python stack).
- Authelia: superb footprint (<30MB) but a forward-auth portal, not a full IAM.

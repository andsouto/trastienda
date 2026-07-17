# ADR-0006: OpenAPI as the canonical contract for all consumers

- Status: accepted

## Context

Admin app (internal consumer) and future shop/third parties (external consumers) must
consume the same API without coupling to its internals.

## Decision

- The **canonical contract is `apps/api/openapi.json`**, generated (`pnpm codegen`)
  from the same TypeBox schemas that drive Fastify validation and serialization
  (`@fastify/swagger`). It is committed to the repo — contract changes show up in
  every PR diff — and published as a release artifact.
- **Internal consumers use the same path as external ones**: the admin generates its
  types from `openapi.json` with `openapi-typescript`
  (`apps/admin/src/app/core/api/schema.d.ts`, also committed). CI regenerates both
  files and fails if they drift from the schemas.
- There is **no shared contracts package**: TypeBox schemas are an implementation
  detail of the API's HTTP adapter and never leave `apps/api`.

## Rationale

The admin exercises daily the exact consumption path offered to third parties, so any
fidelity loss in the OpenAPI generation surfaces immediately, internally. Monorepo
atomicity (ADR-0001) is untouched: one PR changes schemas, `openapi.json`, admin types
and admin code together, validated in one CI run. Sharing the TypeBox schemas as a
workspace package was considered and dropped: its only real advantages (type
propagation without a codegen step, runtime schemas in the frontend) don't outweigh
leaking API internals to consumers and maintaining a publishable package.

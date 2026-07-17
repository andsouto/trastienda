# ADR-0001: Monorepo for the product; deployment config and shop in separate repos

- Status: accepted

## Context

The product has two artifacts sharing one API contract (backend API + admin web app).
A public online shop is planned later, plus the maintainer's own Kubernetes deployment.

## Decision

- **This repo (public, the product)**: pnpm-workspaces monorepo with `apps/api` and
  `apps/admin`. The API contract reaches all consumers — internal and external — as
  the generated `openapi.json` (ADR-0006); there is no shared code package.
- **Deployment/instance repo (private)**: the maintainer's environment config (values,
  overlays, secrets). Packaging itself lives here (see ADR-0009).
- **Shop repo (future, private)**: an external API consumer with its own branding.

## Rationale

API change + admin change = one atomic commit/PR, one CI run validating the whole
contract. Splitting repos would force publishing versioned contract packages and
cross-repo PR sync — pure friction for a solo maintainer. This is "a product with two
artifacts", not a corporate multi-project monorepo.

Tooling: plain pnpm workspaces; with 2 packages a task orchestrator is overhead. Add
**Turborepo** when CI times hurt (Nx only if `affected`/module-boundary rules become
attractive; moon rejected for community size). Reversible: orchestrators only touch
config, not code.

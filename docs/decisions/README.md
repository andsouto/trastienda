# Architecture Decision Records

ADRs are living design documents: each one describes the *current* decision, with just
enough rationale to know how to act — history lives in git, not in the documents.
Update them in place as decisions get refined; simplify or delete an ADR when what it
describes is implemented and self-evident in the code.

They are not a spec to satisfy at all costs. If reality or intent diverges from what an
ADR says, that's a prompt to edit the ADR, not to contort the implementation (or delay
work) to match stale text.

| # | Decision |
|---|----------|
| [0001](0001-repository-strategy.md) | Monorepo for the product; deploy config and shop in separate repos |
| [0002](0002-postgresql-single-source-of-truth.md) | PostgreSQL single source of truth; stock as movement ledger |
| [0003](0003-backend-node-fastify-typebox.md) | Backend on Node LTS with Fastify + TypeBox |
| [0004](0004-hexagonal-ddd-no-di-container.md) | Hexagonal + DDD by domain module; no DI container |
| [0005](0005-prisma-behind-repositories.md) | Prisma behind repositories + UnitOfWork port |
| [0006](0006-openapi-canonical-contract.md) | OpenAPI as the canonical contract for all consumers |
| [0007](0007-frontend-angular.md) | Admin in modern Angular; UI library pending |
| [0008](0008-oidc-resource-server.md) | Provider-agnostic OIDC resource server; Zitadel reference |
| [0009](0009-ci-releases-packaging.md) | GitHub Actions + release-please; packaging ships with the app |
| [0010](0010-license-agpl.md) | AGPL-3.0 |
| [0011](0011-project-name.md) | "trastienda" as provisional codename |

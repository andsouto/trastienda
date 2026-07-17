# ADR-0005: Prisma as ORM, contained behind repositories and a UnitOfWork port

- Status: accepted

## Context

Finalists: Prisma 7 (TypeScript query compiler since Nov 2025 — historical weight/perf
complaints no longer apply) and Drizzle. Both offer top-tier type safety with
different flavors (generated vs inferred types). The maintainer explicitly does not
enjoy raw SQL and values pleasant DX for a hobby project; both were judged equally
valid — this was a preference call.

## Decision

**Prisma**, with strict containment:

- Prisma-generated types live only in `infrastructure/`; repositories map rows to
  domain entities (both directions).
- Cross-repository atomicity via a **UnitOfWork port** in the application layer,
  implemented over `prisma.$transaction()` handing out tx-bound repositories.
- Read models (list screens, reports) may bypass the domain via read-side DAOs
  (lightweight CQRS); `$queryRaw`/TypedSQL is acceptable there.

## Consequences

- Mapping boilerplate in both directions — the accepted price of the layer boundary.
- Aggregate loads can over-fetch; use read models where it matters.
- Codegen step (`prisma generate`) after schema changes, wired into CI.
- Reversible-cheap: the repository pattern means switching to Drizzle later only
  rewrites infrastructure adapters.

## Alternatives rejected

- **Drizzle**: equally valid; lost on maintainer preference (SQL-centric style).
- **MikroORM**: the only truly DDD-style TS ORM (UnitOfWork/identity map), but its
  Hibernate model makes the entity both domain object and persistence mapping —
  violating the layer separation this project is built to practice.

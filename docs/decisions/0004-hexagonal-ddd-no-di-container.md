# ADR-0004: Hexagonal architecture with DDD tactical patterns; no DI container

- Status: accepted

## Context

Core project goal: strict separation of domain / persistence / presentation. The
project is also a learning/pleasure exercise in building that architecture by hand.

## Decision

- Code organized **by domain module** (`catalog/`, `inventory/`, `sales/`), each with
  `domain/` (entities, value objects, invariants — pure TS, zero framework imports),
  `application/` (use cases, ports) and `infrastructure/` (Fastify routes, Prisma
  repositories).
- Constructor injection everywhere; **no DI container**. A single manual composition
  root in `main.ts` wires the graph.
- Modules never import each other. Where one needs another, it declares a port in its
  own vocabulary and the adapter lives in `src/bridges/`, the only place allowed to
  import across modules — see ADR-0013.

## Rationale

Decorator-based containers (InversifyJS, tsyringe) require framework imports inside
the classes we want pure — the exact coupling this architecture exists to prevent —
and clash with erasable-syntax-only TS (Node type stripping). At this scale the
composition root is ~100-200 boring linear lines and shows the whole dependency graph
at a glance. Tests need no container: `new UseCase(fakeRepo)`.

## Revisit trigger

If wiring friction becomes real as the app grows, **Awilix** (no decorators, classes
stay clean) is the agreed escape hatch. Migration is cheap precisely because all
classes already use constructor injection.

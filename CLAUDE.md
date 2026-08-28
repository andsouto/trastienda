# trastienda

Open-source inventory and sales management for small retail: product catalog with
variants (size/color), stock tracked as a movement ledger, sales tickets and purchase
invoices. Backend API + admin web app. A future public online shop will be an external
consumer of the same API (out of scope for now, separate private repo).

**Status (2026-08-03):** monorepo scaffolded and verified (CI, compose, codegen chain);
commit messages now linted per-commit in CI (rebase-only merges to `main`, ADR-0009);
repo is public with the branch-protection ruleset live (PR required, `verify` +
`commitlint` checks required and up to date, linear history, no force-push). **No
domain code yet, but the domain model is designed** (ADR-0012/0013/0014) and the
implementation order is in [docs/roadmap.md](docs/roadmap.md) — next up is block 1,
foundations. Foundational decisions are ADRs in
[docs/decisions/](docs/decisions/) — read them before proposing changes to stack or
architecture; do not re-litigate settled decisions without new evidence. ADRs are
living documents: update in place, git is the history.

## Stack summary

- **Backend**: Node 24 LTS + pnpm, Fastify + TypeBox (ADR-0003), hexagonal architecture
  with DDD tactical patterns, organized by domain module, no DI container (ADR-0004).
  Runs TS natively in dev (`node --watch src/main.ts`); `tsc` build for production.
- **Persistence**: PostgreSQL as single source of truth (ADR-0002), Prisma 7 behind
  repositories + UnitOfWork; Prisma types never leave the infrastructure layer
  (ADR-0005). Client generated to `apps/api/src/generated/` (gitignored). Photos go to
  object storage, never the DB.
- **API contract**: TypeBox schemas drive validation, serialization and OpenAPI.
  `apps/api/openapi.json` is the canonical contract for ALL consumers; the admin
  generates its client from it with orval (ADR-0006/0007). Both generated outputs are
  committed; `pnpm codegen` regenerates, CI fails on drift.
- **Frontend**: Angular 22 (standalone, signals, zoneless), Vitest via `ng test`.
  Resource APIs (`resource`/`rxResource`/`httpResource`) are stable in v22 and are the
  intended data-fetching path. The API client is generated from `openapi.json` with
  **orval** into `apps/admin/src/app/core/api/` (`apps/admin/orval.config.ts`);
  interceptors are where auth, retries and the offline cart queue live (ADR-0007).
  `retrievalClient` is `'httpClient'` — injectable services, reads wrapped in
  `rxResource` — because orval's `httpResource` output did not compile under
  `exactOptionalPropertyTypes`; fixed upstream in orval-labs/orval#3911 and unreleased
  as of v8.26.0, so `'both'` lands as a one-line change on the release that carries it.
  UI library narrowed to Taiga UI (leading) vs ng-zorro-antd, decided by a spike once
  there are real screens.
- **Auth**: the API is a provider-agnostic OIDC resource server; Zitadel is the
  reference IdP in compose at http://localhost:8080 (ADR-0008). Tests use a fake JWKS.
- **Repo**: pnpm-workspaces monorepo — `apps/api`, `apps/admin` (ADR-0001). No task
  orchestrator yet (add Turborepo when CI hurts).
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`), conventional commits,
  release-please manifest mode with a single product version (ADR-0009). `main` only
  takes rebase merges (no merge commits, no squash), gated by a branch-protection
  ruleset requiring green CI + commit-message lint. Releases are merged by hand — no
  auto-publish while there is nothing installable. **Renovate** (`renovate.json`,
  `config:best-practices`) opens dependency PRs: runtime deps land as `fix(deps)` (they
  ship, so they earn a patch bump and a changelog line), tooling as `chore(deps)`.
  **Updates automerge by default on green CI** — the pipeline is the evidence and the
  release is never auto-published. Only two things wait for a human: majors, and Zitadel
  minors (CI never boots it and it migrates its schema on start, so it is tried by hand).
  **All versions are pinned exactly** — these are apps, not libraries, so every version
  change shows up in a reviewable diff.
  Docker images/Kustomize/Timoni arrive when there is something to package.
- **License**: AGPL-3.0 (ADR-0010). "trastienda" is the definitive name (ADR-0011).

## Tooling

- **mise** pins node + pnpm (`mise.toml`) and is the source for the node version; the
  workflow has to repeat it (setup-node cannot read `mise.toml` yet), so Renovate moves
  both pins in one PR and CI fails if they drift apart. `packageManager` in package.json
  is the authoritative pnpm pin (no corepack — pnpm self-switches to it).
- **TypeScript 6.0.x everywhere**: required by Angular 22 (`>=6.0 <6.1`) and the
  ceiling of typescript-eslint (`<6.1`). Move to TS 7 when typescript-eslint allows.
- **ESLint owns TS/JS, config per app** (`apps/api/eslint.config.js`,
  `apps/admin/eslint.config.js`), each importing the shared ruleset from
  `eslint.base.config.js` at root (tseslint strictTypeChecked + stylisticTypeChecked,
  @stylistic — 2 spaces, single quotes, semi, 1tbs —, unicorn, perfectionist, vitest
  plugin), the same relationship `tsconfig.base.json` has with each app's
  `tsconfig.json`. Root `pnpm lint`/`lint:fix` run a root `eslint .` (loose root
  files, `apps/` excluded) plus `pnpm -r lint`/`lint:fix`. Each app's `package.json` lists its own lint
  devDependencies (the shared-ruleset packages stay root devDependencies since
  `eslint.base.config.js` lives there and its imports resolve from that location).
  api adds **eslint-plugin-boundaries**, enforcing the hexagonal layering (ADR-0004) —
  domain imports nothing external, application only node builtins, no cross-module
  imports. admin adds **angular-eslint** (ts rules + templates + a11y).
- **Prettier owns everything else** (html via angular parser, scss, json, yaml);
  TS/JS/md are in `.prettierignore`. Never add eslint-config-prettier — domains
  don't overlap.

## Commands

- `pnpm lint` / `lint:fix`, `pnpm format:check` / `format`, `pnpm typecheck`,
  `pnpm test`, `pnpm build` — all from root.
- `pnpm codegen` — regenerate `openapi.json` + the admin's orval client (run after any
  route/schema change and commit the result).
- `docker compose up -d` — Postgres 18 (:5432), MinIO (:9000/:9001), Zitadel (:8080,
  first login `zitadel-admin@zitadel.localhost` / `Password1!`). Needs `.env`
  (`cp .env.example .env`).
- API integration tests use Testcontainers (needs Docker, no compose required).

## Conventions

- Conventional commits, enforced in CI per commit (`wagoid/commitlint-github-action`,
  ADR-0009) — not just the PR title, since `main` only takes rebase merges and every
  commit lands verbatim; release-please depends on them.
- **Commit and PR bodies go to the point**: what changed in a line (a short paragraph
  in a PR), then why, with the evidence that decided it — the numbers are what stop
  someone reintroducing the thing later. Nothing else. No post-merge instructions,
  checklists or status reports: those are read as history months later, when they mean
  nothing and have cost the reader time. Say them in a PR comment instead, and put a
  long rationale in the ADR the commit references.
- TypeScript strict; erasable-syntax-only in `apps/api` (no `enum`, no `namespace`,
  no decorators) so code stays compatible with Node's native type stripping. Relative
  imports use the real `.ts` extension (`rewriteRelativeImportExtensions` handles the
  build).
- Layering rule per domain module: `domain/` imports nothing from frameworks;
  `application/` defines ports; `infrastructure/` holds Fastify routes and Prisma
  repositories. Composition root is `apps/api/src/main.ts`. Money is stored as
  integer cents.
- Modules never import each other. A module declares a port in its own vocabulary and
  the adapter lives in `src/bridges/` — the only place allowed to import across
  modules, and a readable map of every inter-module dependency (ADR-0013). `shared/`
  holds the shared kernel (`Money`, `TaxRate`) and is the one exception to the
  domain-imports-nothing rule.

## Domain model

Designed in full in ADR-0012 (aggregates), ADR-0013 (consistency) and ADR-0014
(fiscal). The base needed to work without re-reading it all:

- **Aggregate roots**: `Product` (variants are internal entities with globally unique
  UUIDs — that UUID is what everything else references), `StockLevel` (variant +
  location; the ledger is not the aggregate), `Ticket` (born closed, immutable).
- **Everything is append-only.** Stock movements, tickets and fiscal records are
  never updated or deleted; corrections are compensating facts. Nothing referenced is
  hard-deleted (`ON DELETE RESTRICT`); archiving is the normal path.
- **Documents freeze what they state** — price, tax rate, textual description, the
  recipient's tax details. Catalog changes never rewrite history, and this is also
  what lets GDPR erasure and fiscal retention coexist.
- **Every fact records its actor and its moment** (`occurredAt` orders, `recordedAt`
  audits, actor from the token). Impossible to reconstruct later.
- **Negative stock is allowed**; blocking a sale is a policy in `application/`, never
  a domain invariant. Valuation is derived (daily weighted average), never stored,
  except the frozen year-end snapshot.
- **Cross-aggregate invariants always name their mechanism** (unique index, row lock,
  or an explicit "nothing"). See the table in ADR-0013.

## Pending decisions

- Angular UI library: **Taiga UI vs ng-zorro-antd** (ADR-0007). Material and spartan-ng
  are out. Taiga leads on catalog, maintenance health and peer range; ng-zorro still has
  the better data table, so the tiebreaker is one real catalog screen built both ways —
  which needs an API first.
- How the *declaración responsable* required by RD 1007/2023 works for AGPL software
  deployed and modified by third parties (ADR-0014); needs advice, not a guess.
- A formal trademark scan for "trastienda" before publishing artifacts (ADR-0011).
- Whether to push orval upstream on `tagsSplitDeduplication`, which does nothing for the
  Angular client — measured and parked in ADR-0007, to revisit once the client runs
  `retrievalClient: 'both'` with several tags.

## Next steps

Implementation order lives in [docs/roadmap.md](docs/roadmap.md). Immediately:

1. OIDC auth plugin in the API (jose + remote JWKS) — first, so the first route is
   written with its final shape instead of being retrofitted.
2. Rest of block 1: shared kernel (`Money`, `TaxRate`) with its boundaries and
   `bridges/` rules in the eslint config, business configuration (tax regime + seeded
   editable rates), reference data seeds (scales, palettes).
3. Block 2 (catalog) as the first full vertical slice, Prisma schema and first
   migration included.

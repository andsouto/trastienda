# trastienda

Open-source inventory and sales management for small retail: product catalog with
variants (size/color), stock tracked as a movement ledger, sales tickets and purchase
invoices. Backend API + admin web app. A future public online shop will be an external
consumer of the same API (out of scope for now, separate private repo).

**Status (2026-07-20):** monorepo scaffolded and verified (CI, compose, codegen chain);
commit messages now linted per-commit in CI (rebase-only merges to `main`, ADR-0009);
repo visibility flip to public + the branch-protection ruleset that depends on it are
still pending manual execution. No domain code yet. Foundational decisions are ADRs in
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
  generates its types from it with openapi-typescript (ADR-0006). Both generated files
  are committed; `pnpm codegen` regenerates, CI fails on drift.
- **Frontend**: Angular 22 (standalone, signals, zoneless), Vitest via `ng test`.
  UI library still pending — shortlist in ADR-0007.
- **Auth**: the API is a provider-agnostic OIDC resource server; Zitadel is the
  reference IdP in compose at http://localhost:8080 (ADR-0008). Tests use a fake JWKS.
- **Repo**: pnpm-workspaces monorepo — `apps/api`, `apps/admin` (ADR-0001). No task
  orchestrator yet (add Turborepo when CI hurts).
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`), conventional commits,
  release-please manifest mode with a single product version (ADR-0009). `main` only
  takes rebase merges (no merge commits, no squash), gated by a branch-protection
  ruleset requiring green CI + commit-message lint. Docker images/Kustomize/Timoni
  arrive when there is something to package.
- **License**: AGPL-3.0 (ADR-0010). Name "trastienda" is a provisional codename (ADR-0011).

## Tooling

- **mise** pins node + pnpm (`mise.toml`); `packageManager` in package.json is the
  authoritative pnpm pin (no corepack — pnpm self-switches to it).
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
- `pnpm codegen` — regenerate `openapi.json` + admin `schema.d.ts` (run after any
  route/schema change and commit the result).
- `docker compose up -d` — Postgres 18 (:5432), MinIO (:9000/:9001), Zitadel (:8080,
  first login `zitadel-admin@zitadel.localhost` / `Password1!`). Needs `.env`
  (`cp .env.example .env`).
- API integration tests use Testcontainers (needs Docker, no compose required).

## Conventions

- Conventional commits, enforced in CI per commit (`wagoid/commitlint-github-action`,
  ADR-0009) — not just the PR title, since `main` only takes rebase merges and every
  commit lands verbatim; release-please depends on them.
- TypeScript strict; erasable-syntax-only in `apps/api` (no `enum`, no `namespace`,
  no decorators) so code stays compatible with Node's native type stripping. Relative
  imports use the real `.ts` extension (`rewriteRelativeImportExtensions` handles the
  build).
- Layering rule per domain module: `domain/` imports nothing from frameworks;
  `application/` defines ports; `infrastructure/` holds Fastify routes and Prisma
  repositories. Composition root is `apps/api/src/main.ts`. Money is stored as
  integer cents.

## Pending decisions

- Angular UI library: ng-zorro-antd vs Angular Material vs Taiga UI vs spartan-ng.
- Admin HTTP client for the generated types (openapi-fetch vs typed HttpClient wrappers).
- Final project name (codename is fine until artifacts are published).

## Next steps

1. Domain model design session: aggregates for catalog/inventory/sales, stock ledger
   invariants, UnitOfWork pattern.
2. OIDC auth plugin in the API (jose + remote JWKS) once there are endpoints to protect.

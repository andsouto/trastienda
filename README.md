# trastienda

Open-source inventory and sales management for small retail.

- Product catalog with variants (size, color), photos and flexible attributes.
- Stock tracked as an auditable ledger of movements (goods receipt, sale, adjustment).
- Sales tickets and purchase invoices.
- REST API (OpenAPI) + Angular admin app. Bring your own OIDC identity provider.

> ⚠️ Early stage: the domain model is designed, no domain code yet. Architecture
> decisions live in [docs/decisions/](docs/decisions/) and the implementation order in
> [docs/roadmap.md](docs/roadmap.md).

## Development

Requirements: [mise](https://mise.jdx.dev) and Docker. mise pins node, pnpm and
[process-compose](https://f1bonacc1.github.io/process-compose/).

```sh
mise install
pnpm install
cp .env.example .env
process-compose up      # everything, one TUI: Postgres 18, MinIO, Zitadel (:8080)
                        # through docker compose, then api (:3000) and admin (:4200)
```

Each process is one pnpm script, so they also run on their own:

```sh
docker compose up -d                  # infra only
pnpm --filter @trastienda/api dev     # API on http://localhost:3000
pnpm --filter @trastienda/admin dev   # admin on http://localhost:4200
```

The api process runs with the inspector on :9229; the "Attach to API" launch in
`.vscode/` puts breakpoints on it and survives `--watch` restarts.

Everyday commands, from the repo root:

```sh
pnpm lint         # ESLint (owns TS; layering rules included)
pnpm format       # Prettier (owns html/scss/json/yaml)
pnpm typecheck
pnpm test         # unit + integration (Testcontainers)
pnpm build
pnpm codegen      # regenerate openapi.json + the admin client, commit the result
```

The canonical API contract is [apps/api/openapi.json](apps/api/openapi.json),
generated from the TypeBox schemas; the admin consumes it through a generated client
(orval), the same path offered to any external consumer.

## License

[AGPL-3.0](LICENSE)

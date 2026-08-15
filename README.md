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

Requirements: [mise](https://mise.jdx.dev) (or Node 24 + pnpm 11 by other means) and
Docker.

```sh
mise install            # node + pnpm
pnpm install
cp .env.example .env
docker compose up -d    # Postgres 18, MinIO, Zitadel (http://localhost:8080)

pnpm --filter @trastienda/api dev      # API on http://localhost:3000
pnpm --filter @trastienda/admin start  # admin on http://localhost:4200
```

Everyday commands, from the repo root:

```sh
pnpm lint         # ESLint (owns TS; layering rules included)
pnpm format       # Prettier (owns html/scss/json/yaml)
pnpm typecheck
pnpm test         # unit + integration (Testcontainers)
pnpm build
pnpm codegen      # regenerate openapi.json + admin API types, commit the result
```

The canonical API contract is [apps/api/openapi.json](apps/api/openapi.json),
generated from the TypeBox schemas; the admin consumes it through generated types
(openapi-typescript), the same path offered to any external consumer.

## License

[AGPL-3.0](LICENSE)

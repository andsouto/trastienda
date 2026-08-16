# ADR-0007: Admin frontend in modern Angular; HTTP client settled, UI library narrowed

- Status: accepted (UI library: narrowed to two, pending a spike)

## Context

Maintainer preference and familiarity; Angular is objectively strong for large
CRUD/forms-heavy admin apps (reactive forms).

## Decision

Modern Angular: standalone components, signals, new control flow, zoneless. As of
Angular 22 the resource APIs (`resource`, `rxResource`, `httpResource`) are stable and
zoneless is the default path, so both are load-bearing rather than aspirational.

### HTTP client: a typed wrapper over `HttpClient`

Types keep coming from the contract — `openapi-typescript` generates `schema.d.ts`
from `openapi.json` (ADR-0006) and that does not change. What is decided here is the
*runtime*: **Angular's `HttpClient`, behind a small generic wrapper** that navigates
the generated `paths` type, so a route literal types its own response:

```ts
type GetPath = { [P in keyof paths]: paths[P] extends { get: object } ? P : never }[keyof paths];
type JsonOk<Op> = Op extends { responses: { 200: { content: { 'application/json': infer B } } } } ? B : never;

get<P extends GetPath>(path: P) {
  return this.#http.get<JsonOk<paths[P]['get']>>(`/api${path}`);
}
```

Path params, query strings and request bodies take it to roughly 80 lines; the shape
is the same conditional-type navigation.

`HttpClient` rather than `openapi-fetch` because **interceptors** are where the auth
token, retries and — decisively — the offline cart queue (ADR-0012) belong, and a
`fetch`-based client would mean rebuilding all of it. `provideHttpClientTesting` comes
along for free.

**Alternative kept on file: `ng-openapi-gen`** (MIT, ~158k weekly downloads, v1.0.5).
It generates injectable Angular services with typed methods, so there is no glue to
write at all, and since it also builds on `HttpClient` the interceptor story is
identical. It loses here on three counts: it *replaces* `openapi-typescript` in the
admin rather than complementing it (so it moves what ADR-0006 settled), it commits a
large volume of generated code, and it had no release between November 2025 and this
decision while Angular ships two majors a year. What would flip it: many multipart
uploads, complex query serialisation, or an endpoint count where hand-maintained
conditional types stop being cheaper than regenerating. Reversible either way.

Note for the record: returning Observables is *not* an argument against generated
clients — `rxResource` bridges them to signals and is stable in v22.

### UI library: Taiga UI leading, ng-zorro-antd the alternative

Measured in August 2026, all four candidates supported Angular 22, so compatibility
decided nothing. Maintenance health did:

| | ng-zorro-antd | Taiga UI | spartan-ng |
|---|---|---|---|
| License | MIT | Apache-2.0 | MIT |
| Stars | 9.2k | 4.0k | 2.8k |
| Commits over 3.5 months | 74 | 508 (164 by bots) | 537 |
| Distinct authors | 11 | 21 | 36 |
| Open issues | 783 | 154 | 88 |
| Components | 83 | ~91 plus addons | 62 |

- **Angular Material — rejected.** Smallest component set of the four and a design
  language built for low information density and touch, while this is a dense
  back-office. `MatTable` is a low-level primitive: filtering, sorting and paging would
  be built on top.
- **spartan-ng — rejected.** Best contributor health of the three, and the earlier
  read of it as a one-maintainer project was wrong (that is only true of npm
  publishing). It loses on cost: its CLI copies component source into the repo, so
  those lines become ours to maintain, and its `table` is a styled primitive rather
  than a data grid — the ledger and catalog screens would need TanStack Table on top.
- **Taiga UI — leading.** Largest catalog, including `addon-table` and an
  `addon-commerce` with money and card inputs that lands directly in this domain.
  Peer range `>=19`, so it never blocks an Angular major. Zoneless and hydration
  compatible. Healthily maintained by three core people plus bots.
- **ng-zorro-antd — alternative.** Its table is still the most batteries-included of
  the lot, which is what the catalog and ledger screens lean on hardest. Against it:
  by far the least active of the three (74 commits concentrated in one person) despite
  being the most starred, 783 open issues, and a `^22` peer that makes every Angular
  major wait for it.

**Deciding test, deferred until there are real screens to build:** implement one
catalog screen against `addon-table` and against ng-zorro's table. Taiga wins on
everything except the table, so the table is what has to be tried.

One risk to weigh that is not visible in the numbers: Taiga's core team is Russian (it
originates at Tinkoff / T-Bank). That is not a license risk — Apache-2.0 is
irrevocable for what is published — but Russian-origin OSS has lost infrastructure
access to sanctions before, and that is a continuity question.

## Alternatives rejected

- **PrimeNG**: disqualified June 2026 — v22+ moved to a commercial license (PrimeUI),
  community edition gated by company size/revenue; existing MIT versions frozen.
  Unacceptable dependency for an AGPL open-source product.
- **`openapi-fetch`**: see above — no interceptors, so auth, retries and the offline
  queue would all be rebuilt.
- **`openapi-fetch-angular`**: exactly the right idea, effectively dead (last publish
  March 2024, single digit weekly downloads).
- **`ng-openapi`**: active but pre-1.0, single maintainer, and ~3k weekly downloads
  against `ng-openapi-gen`'s ~158k.
- The future public shop is NOT bound to Angular (SEO/SSR may favor other frameworks);
  decision deferred, separate repo.

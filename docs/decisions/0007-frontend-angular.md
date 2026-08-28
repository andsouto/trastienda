# ADR-0007: Admin frontend in modern Angular; orval for the API client, UI library narrowed

- Status: accepted (UI library: narrowed to two, pending a spike)

## Context

Maintainer preference and familiarity; Angular is objectively strong for large
CRUD/forms-heavy admin apps (reactive forms).

## Decision

Modern Angular: standalone components, signals, new control flow, zoneless. As of
Angular 22 the resource APIs (`resource`, `rxResource`, `httpResource`) are stable and
zoneless is the default path, so both are load-bearing rather than aspirational.

### HTTP client: orval, generating against `openapi.json`

The contract stays the source (ADR-0006): the admin generates its client from
`openapi.json`, the same artifact any external consumer gets. What is decided here is
*how*: **orval** (MIT, v8.26.0, ~1.9M weekly downloads, 74 contributors over the last
quarter), configured in `apps/admin/orval.config.ts`, emitting into
`src/app/core/api/` and committed like the spec itself.

The shape wanted is `override.angular.retrievalClient: 'both'`: **`httpResource`
helpers for reads** (signal-first, which is the Angular 22 data path) and **injectable
`HttpClient` services for writes**. Both sit on `HttpClient`, so **interceptors keep
being where the auth token, retries and the offline cart queue (ADR-0012) live** — the
requirement that drove this decision in the first place.

**What ships configured is `'httpClient'`**, for the reason below. Reads go through
`rxResource` over the generated services meanwhile: returning Observables is not an
argument against generated clients — `rxResource` bridges them to signals and is stable
in v22 — and flipping to `'both'` is a one-line config change plus a regeneration.

Orval replaces `openapi-typescript` in the admin: it generates its own models rather
than a `paths` type. The principle of ADR-0006 is untouched, only the generator
changes.

`@orval/mock` (MSW) and `@orval/zod` come with the meta package. Mocks are worth using
for admin tests without a live API; runtime response validation via zod is available
and not adopted — the API already validates, and paying that cost twice needs a reason.

**Risk, stated precisely:** orval's lineage is React (react-query is its flagship) and
the Angular target — `httpResource` support especially — is younger. `@orval/angular`'s
~1.9M weekly downloads are within a rounding error of orval's own, which is the proof
that the meta package pulls it for everyone: that number is *not* evidence of the
Angular target being widely exercised. Mitigation is inherent to generators: the
emitted code is ours, so disappointing output means switching tools, not being
stranded. The hand-written typed wrapper over `HttpClient` — roughly 80 lines of
conditional-type navigation over an `openapi-typescript` `paths` type, and the prior
decision here — stays the escape hatch.

**The smoke test was run here instead of deferred, and it caught that risk on first
contact:** with `retrievalClient: 'both'`, the emitted `*.resource.ts` does not compile
under `exactOptionalPropertyTypes` — TS2375, the request-extension helper added in
orval-labs/orval#3710 assigns a possibly-undefined `headers` into `HttpResourceRequest`.
The `httpClient` half compiles clean, so the config ships as `'httpClient'`; the
alternative was dropping `exactOptionalPropertyTypes` for every line of admin code to
accommodate one generated helper. Reported as orval-labs/orval#3909 and **fixed
upstream in #3911** — the suggested three-line change, plus a regression guard that
typechecks the generated samples under `exactOptionalPropertyTypes`, so it stays fixed.
It is unreleased as of v8.26.0: the flip to `'both'` is a one-line config change on the
release that carries it.

**Still deferred to block 1**, with the first real endpoint: that interceptors compose
as expected over the generated services. Same posture as the UI library spike below —
decided on paper, confirmed on contact.

**`tagsSplitDeduplication` is parked, with the measurement that says it can wait.** The
option promises to hoist each tag file's shared plumbing into a `common-types.ts`; with
`client: 'angular'` it hoists nothing, because `@orval/angular` never declares
`sharedTypes` (`fetch`, `query`, `swr` and `mcp` do), so all it emits is a root barrel —
and one that reexports the services but not the resources. Under `'both'` that leaves
111 of every `*.resource.ts`'s 150 lines duplicated per tag. It is not a bundle problem:
ten copies of that block in one chunk cost 587 B gzipped against 507 B for one, because
DEFLATE references the repeats; only copies landing in separate lazy chunks pay in full,
about 0.5 kB gzipped each. What it does cost is ~111 committed lines per tag regenerated
into every contract diff, and duplication is where generator drift hides — #3813 was
exactly a drifted copy of core's import rule in the resource files. Worth raising
upstream as a documentation-or-behaviour mismatch (either wire angular in or document
the limitation), but once `'both'` is live and there are several tags to measure in a
real app rather than in a lab.

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
- **`openapi-fetch`**: no interceptors, so auth, retries and the offline queue would
  all be rebuilt on a `fetch` client.
- **A hand-written typed wrapper over `HttpClient`**: the previous decision here, and
  still the fallback. It loses to orval on nothing except dependency count, and the
  `httpResource` half it would hand-roll is generated instead — once orval emits it
  under `exactOptionalPropertyTypes`.
- **`ng-openapi-gen`**: the closest competitor (MIT, ~158k weekly downloads, v1.0.5),
  but no release between November 2025 and this decision while Angular ships two
  majors a year, effectively one maintainer, and no `httpResource` generation.
- **`openapi-fetch-angular`**: exactly the right idea, effectively dead (last publish
  March 2024, single digit weekly downloads).
- **`ng-openapi`**: active but pre-1.0, single maintainer, and ~3k weekly downloads.
- The future public shop is NOT bound to Angular (SEO/SSR may favor other frameworks);
  decision deferred, separate repo.

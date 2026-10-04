# ADR-0007: Admin frontend in modern Angular; orval for the API client

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
*how*: **orval** (MIT, 74 contributors over the quarter before the decision),
configured in `apps/admin/orval.config.ts`, emitting into
`src/app/core/api/` and committed like the spec itself.

The shape is `override.angular.retrievalClient: 'both'`: **`httpResource`
helpers for reads** (signal-first, which is the Angular 22 data path) and **injectable
`HttpClient` services for writes**. Both sit on `HttpClient`, so **interceptors stay the
place for the auth token, retries and the offline cart queue (ADR-0012)** — the
requirement that drove this decision in the first place.

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
contact:** the emitted `*.resource.ts` did not compile under
`exactOptionalPropertyTypes` (orval-labs/orval#3909). Fixed upstream in #3911, with a
regression guard that typechecks the generated samples under the flag — so the risk
is real, and covered where it should be.

## Alternatives rejected

- **Angular Material**: the smallest component set of the UI libraries measured and a
  design language built for low information density and touch, while this is a dense
  back-office. `MatTable` is a low-level primitive: filtering, sorting and paging would
  be built on top.
- **spartan-ng**: the best contributor health of them (reading it as a one-maintainer
  project was wrong; that is only true of npm publishing), but it loses on cost: its
  CLI copies component source into the repo, so those lines become ours to maintain,
  and its `table` is a styled primitive rather than a data grid — the ledger and
  catalog screens would need TanStack Table on top.
- **PrimeNG**: disqualified June 2026 — v22+ moved to a commercial license (PrimeUI),
  community edition gated by company size/revenue; existing MIT versions frozen.
  Unacceptable dependency for an AGPL open-source product.
- **`openapi-fetch`**: no interceptors, so auth, retries and the offline queue would
  all be rebuilt on a `fetch` client.
- **A hand-written typed wrapper over `HttpClient`**: the previous decision here, and
  still the fallback. It loses to orval on nothing except dependency count, and the
  `httpResource` half it would hand-roll is generated instead.
- **`ng-openapi-gen`**: the closest competitor (MIT, ~158k weekly downloads, v1.0.5),
  but no release between November 2025 and this decision while Angular ships two
  majors a year, effectively one maintainer, and no `httpResource` generation.
- **`openapi-fetch-angular`**: exactly the right idea, effectively dead (last publish
  March 2024, single digit weekly downloads).
- **`ng-openapi`**: active but pre-1.0, single maintainer, and ~3k weekly downloads.
- The future public shop is NOT bound to Angular (SEO/SSR may favor other frameworks);
  decision deferred, separate repo.

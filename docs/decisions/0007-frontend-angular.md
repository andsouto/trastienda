# ADR-0007: Admin frontend in modern Angular; UI library pending

- Status: accepted (UI library: pending)

## Context

Maintainer preference and familiarity; Angular is objectively strong for large
CRUD/forms-heavy admin apps (reactive forms).

## Decision

Modern Angular: standalone components, signals, new control flow, zoneless where
possible. API client generated from the OpenAPI spec (ADR-0006).

**UI library still undecided.** Shortlist:

- **ng-zorro-antd** (MIT) — Ant Design; strongest admin tables/forms.
- **Angular Material + CDK** (MIT) — maximum longevity (Angular team).
- **Taiga UI** (Apache-2.0) — polished, smaller community.
- **spartan-ng** (MIT) — shadcn-style headless + Tailwind; max control, younger.

## Alternatives rejected

- **PrimeNG**: disqualified June 2026 — v22+ moved to a commercial license (PrimeUI),
  community edition gated by company size/revenue; existing MIT versions frozen.
  Unacceptable dependency for an AGPL open-source product.
- The future public shop is NOT bound to Angular (SEO/SSR may favor other frameworks);
  decision deferred, separate repo.

# Roadmap

Implementation order, not a release plan. What counts as a "minimum viable" deployment
depends on the shop, so there is no MVP line here — only what gets built and in what
order. Each block includes its admin screens; an API nobody can use is not a delivered
block.

This is the one document that tracks state: what is done, what comes next, and the
decisions still open with the evidence gathered so far. Why things are the way they are
lives in the [ADRs](decisions/); the domain decisions behind these blocks are in
[ADR-0012](decisions/0012-domain-model-aggregates.md),
[ADR-0013](decisions/0013-invariants-unit-of-work-bridges.md) and
[ADR-0014](decisions/0014-fiscal-and-deployment-scope.md).

## 1. Foundations — in progress

Done: the OIDC resource server of ADR-0008, first and before the endpoints it protects,
so that the first route ever written already has its final shape rather than being
rewritten once authentication shows up.

Left:

- The shared kernel (`Money`, `TaxRate`), whose `eslint-plugin-boundaries` exception is
  already in place, and the `bridges/` rules of ADR-0013 — the first time that
  architecture becomes executable config rather than a document.
- Business configuration: tax regime, seeded and editable rates.
- Reference data: scales and palettes by seed, no management UI.
- With the first real endpoint, confirming that interceptors compose as expected over
  the services orval generates (ADR-0007): decided on paper, confirmed on contact.

## 2. Catalog

Category tree, brands, seasons; products with options and variants, SKU and GTINs,
price with optional variant override, lifecycle states. Everything else references it.
Its first screen settles the UI library (see [open decisions](#ui-library-taiga-ui-or-ng-zorro-antd)).

## 3. Inventory

Locations, `StockLevel` and the movement ledger, receipts, adjustments and shrinkage,
instant transfers, and **physical stock counts** — which belong here rather than later,
because they are what makes allowing negative balances liveable.

## 4. Sales

Tickets with frozen price and tax, series and gapless numbering, returns. Shaped for
VERI*FACTU from the start even though submission does not exist yet. Includes the
offline-first cart (client-owned, synced, no expiry, no stock reservation) and the
optional customer link.

## 5. VERI*FACTU

Issue and cancellation records, chaining, QR and legend, submission through an outbox.
Includes customers in their fiscal form, since a full invoice needs the recipient's tax
details. Nobody invoices for real with it until the
[declaración responsable](#declaración-responsable) is settled.

## 6. Purchasing and suppliers

Supplier records, purchase invoices linked to receipts, price lists. It sits behind
inventory because a receipt with a hand-entered cost already lets the shop operate.

## 7. Users and permissions

Roles on top of the identity OIDC provides: who adjusts stock, who grants discounts,
who sees margins.

## 8. Labels

Barcode and price label printing — the SKU rendered as Code-128.

## 9. Reporting and valuation

Daily weighted average, inventory value, margins, and frozen year-end snapshots.

## 10. Cash book

Till reconciliation and cash flow. The third ledger, alongside stock and documents.

## 11. Reorder points

Minimum stock and replenishment suggestions.

## 12. Full POS

Mixed payments, till open/close, and offline operation — each till becoming its own
invoicing system (SIF) with its own chain and series, per ADR-0014. Selling through an
internet outage is a goal, not a nice-to-have; this is where it lands. The big jump.

## Packaging

When there is something installable: the release artifacts of ADR-0009, built from the
release tag, and with them the CD design for the maintainer's own deployment. The
[trademark scan](#trademark-scan) comes first.

## Later, unordered

Freight cost allocation across a shipment, management UI for reference data, goods in
transit, reservations and inter-warehouse allocation rules, descriptive attributes
with filtering, the public shop (a separate repo consuming the same API), full data
export, change auditing beyond the ledger.

## Deliberately excluded

| Excluded | Why |
|---|---|
| Lot, expiry and serial tracking | Would change the stock balance key from variant to variant+lot |
| Size-system equivalences | Approximate and manufacturer-dependent; asserting them invites returns |
| VAT pro rata | Would force regularising costs already written |
| Multi-category products | Breaks per-category reporting sums |
| Multi-tenancy | See ADR-0014; solvable later through orchestration |
| Catalog import | No standard format — a script against the API is deployment work, not product |

## Open decisions

### UI library: Taiga UI or ng-zorro-antd

Material, spartan-ng and PrimeNG are out (ADR-0007). Measured in August 2026, every
candidate supported Angular 22, so compatibility decided nothing. Maintenance health
did:

| | ng-zorro-antd | Taiga UI | spartan-ng |
|---|---|---|---|
| License | MIT | Apache-2.0 | MIT |
| Stars | 9.2k | 4.0k | 2.8k |
| Commits over 3.5 months | 74 | 508 (164 by bots) | 537 |
| Distinct authors | 11 | 21 | 36 |
| Open issues | 783 | 154 | 88 |
| Components | 83 | ~91 plus addons | 62 |

- **Taiga UI — leading.** Largest catalog, including `addon-table` and an
  `addon-commerce` with money and card inputs that lands directly in this domain.
  Peer range `>=19`, so it never blocks an Angular major. Zoneless and hydration
  compatible. Healthily maintained by three core people plus bots.
- **ng-zorro-antd — alternative.** Its table is still the most batteries-included of
  the lot, which is what the catalog and ledger screens lean on hardest. Against it:
  by far the least active (74 commits concentrated in one person) despite being the
  most starred, 783 open issues, and a `^22` peer that makes every Angular major wait
  for it.

**Deciding test**, once there are real screens to build: implement one catalog screen
against `addon-table` and against ng-zorro's table. Taiga wins on everything except the
table, so the table is what has to be tried.

One risk to weigh that is not visible in the numbers: Taiga's core team is Russian (it
originates at Tinkoff / T-Bank). That is not a license risk — Apache-2.0 is
irrevocable for what is published — but Russian-origin OSS has lost infrastructure
access to sanctions before, and that is a continuity question.

### Declaración responsable

Certification under RD 1007/2023 is self-certification by the producer, embedded in
the product, and it also binds those who develop software for their own use. How that
works for AGPL software that third parties deploy and modify is not resolved in the
official sources (ADR-0014): it needs advice, not a guess, before anyone invoices for
real. Once the product is usable it also warrants a note stating who assumes the
responsible declaration in each deployment; AGPL sections 15 and 16 already exclude
warranty, but say nothing about that.

### Trademark scan

A formal EUIPO/USPTO trademark scan for "trastienda" in the software class, before
publishing the first artifacts — not because the name is in doubt, but because that is
the moment it stops being cheap to change (ADR-0011).

### orval's `tagsSplitDeduplication`

Parked, with the measurement that says it can wait. The option promises to hoist each
tag file's shared plumbing into a `common-types.ts`; with `client: 'angular'` it hoists
nothing, because `@orval/angular` never declares `sharedTypes` (`fetch`, `query`, `swr`
and `mcp` do), so it adds nothing — the root barrel comes regardless. That leaves ~140
of every `*.resource.ts`'s 171 lines duplicated per tag. It is not a bundle problem:
ten copies of that block in one chunk cost 587 B gzipped against 507 B for one, because
DEFLATE references the repeats; only copies landing in separate lazy chunks pay in
full, about 0.5 kB gzipped each. What it does cost is ~140 committed lines per tag
regenerated into every contract diff, and duplication is where generator drift hides —
orval-labs/orval#3813 was exactly a drifted copy of core's import rule in the resource
files. Worth raising upstream as a documentation-or-behaviour mismatch (either wire
angular in or document the limitation), but once there are several tags to measure in
a real app rather than in a lab.

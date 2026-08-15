# Roadmap

Implementation order, not a release plan. What counts as a "minimum viable" deployment
depends on the shop, so there is no MVP line here — only what gets built and in what
order. Each block includes its admin screens; an API nobody can use is not a delivered
block.

The domain decisions behind these are in [ADR-0012](decisions/0012-domain-model-aggregates.md),
[ADR-0013](decisions/0013-invariants-unit-of-work-bridges.md) and
[ADR-0014](decisions/0014-fiscal-and-deployment-scope.md).

## 1. Foundations

Shared kernel (`Money`, `TaxRate`) with its `eslint-plugin-boundaries` exception,
business configuration (tax regime, seeded and editable rates), reference data (scales
and palettes by seed, no management UI), and the OIDC plugin of ADR-0008 as soon as
there is an endpoint to protect.

## 2. Catalog

Category tree, brands, seasons; products with options and variants, SKU and GTINs,
price with optional variant override, lifecycle states. Everything else references it.

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
details.

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

## Later, unordered

Freight cost allocation across a shipment, management UI for reference data, goods in
transit and reservations, descriptive attributes with filtering, the public shop (a
separate repo consuming the same API), full data export, change auditing beyond the
ledger.

## Deliberately excluded

| Excluded | Why |
|---|---|
| Lot, expiry and serial tracking | Would change the stock balance key from variant to variant+lot |
| Size-system equivalences | Approximate and manufacturer-dependent; asserting them invites returns |
| VAT pro rata | Would force regularising costs already written |
| Multi-category products | Breaks per-category reporting sums |
| Multi-tenancy | See ADR-0014; solvable later through orchestration |
| Catalog import | No standard format — a script against the API is deployment work, not product |

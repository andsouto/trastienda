# ADR-0012: Domain model — aggregates and their boundaries

- Status: accepted

## Context

The domain model was designed in full before writing code, so that the aggregate
boundaries, the identifiers other modules reference, and the facts that must be
captured from day one are settled. Some choices here are cheap now and effectively
irreversible later, because they decide the *key* of a balance or the identity a
document freezes.

## Decision

### Catalog

- **`Product` is the aggregate root; `ProductVariant` is an internal entity** with a
  globally unique UUID. Inventory and sales reference that UUID. The invariants that
  justify the boundary are set-wide: no two variants share the same option
  combination, and every variant matches the options the product declares.
- **Variation is modelled as axis → scale → value**, not as free strings and not as
  fixed size/colour fields. A `VariationAxis` (Talla, Color, Capacidad) has ordered
  `Scale`s ("Calzado EU 35-47", "Pantalón mujer ES 34-48"), each with positioned
  values. A product declares an axis, picks a scale and a subset of its values.
  This is what makes the 38 of footwear and the 38 of trousers *different entities*
  that happen to share a label; equality is by identity, never by string.
- **Scales and palettes are reference data seeded from code**, materialised as rows
  and referenced by FK. No management UI initially: a new scale is a migration. The
  criterion against the category tree below is *universal vocabulary → seed; the
  business's own taxonomy → CRUD*.
- **Categories are a user-editable tree**: adjacency list (`parentId` nullable), one
  category per product, max depth 5, no cycles, and deleting a category promotes its
  children to its parent. Descendant queries use a recursive CTE in a read model
  (`ltree` and materialised paths buy performance this scale will never need, at the
  cost of maintaining redundant state).
- **Brand and season are first-class entities**, like category. The cut-off rule:
  what appears in a `WHERE` or a `GROUP BY` is an entity or a column; what only shows
  on a detail view is JSONB (material, composition, care) that the domain never
  validates.
- **Identifiers**: `sku` nullable and unique (a plain unique index — Postgres treats
  NULLs as distinct), plus a **collection of GTINs**, non-unique but indexed. GTIN-8,
  12, 13 and 14 are one numbering space, stored **normalised to 14 digits** (the only
  length that holds all four, packaging codes included) with the original kept for
  display, and validated by check digit in the value object. Non-GS1 codes are not
  modelled: a code the shop generates *is* the SKU, and printing it as Code-128 is a
  rendering concern.
- **Price includes VAT** (the shopfloor price is what must not drift), at product
  level with an optional variant override; integer cents. Tax rate lives on the
  product.
- **Lifecycle**: `draft | active | archived`. Nothing referenced is ever hard-deleted;
  FKs are `ON DELETE RESTRICT` and the repository translates the violation.

### Inventory

- **`StockLevel` (variant + location) is the aggregate** — one small row holding the
  balance, and the thing that gets locked. The ledger cannot be the aggregate: loading
  every movement of a variant grows without bound.
- **`StockMovement` is an append-only fact**: signed quantity, type (receipt, sale,
  customer return, supplier return, shrinkage, adjustment, transfer, cost adjustment),
  `occurredAt` (business date, what orders it) and `recordedAt` (when it entered the
  system), plus the **actor** taken from the token. Corrections are compensating
  movements; rows are never updated or deleted.
- Both are written **in the same transaction**. The balance is derived and therefore
  verifiable: `SUM(movements) == balance` is an integration test and a periodic check.
  If they diverge, the ledger wins.
- **A monotonic sequence** breaks ties that `occurredAt` leaves ambiguous and enables
  gap detection. It cannot be reconstructed retroactively, hence day one.
- **`locationId` from day one**, with a single seeded location. Transfers are two
  movements in one transaction, instant, with no goods-in-transit state.
- **Negative balances are allowed.** A movement describes something that already
  happened physically; refusing to record it loses the sale and hides the discrepancy
  that was already there. The *policy* (warn and block a sale without stock, unless
  explicitly overridden) lives in `application/`, never in the domain.
- **Unit cost is stored on entry movements** — it is the one figure that cannot be
  reconstructed later. Landed cost arrives as a cost-adjustment movement (quantity 0,
  cost delta), which keeps the ledger append-only when the freight invoice shows up
  after the goods.
- **Valuation is derived, never stored**: daily weighted average, which also removes
  the intra-day ordering ambiguity by construction. The sole exception is the
  **year-end snapshot**, frozen because it was declared.

### Sales

- **A ticket is created already closed.** A fiscal document in draft state is a
  contradiction: it has no number, must have none, and pollutes every later query.
- **The cart lives outside the fiscal domain**: a thin, offline-first aggregate with
  client-generated idempotent line ids, several per user, deleted only by hand and
  never expiring. It stores *references, not prices* — a month-old cart must charge
  today's price, resolved at emission — and it reserves no stock. Because it outlives
  the catalog state it was built from, **stale references are a normal case, not an
  error**: a line whose variant was archived or discontinued in the meantime surfaces
  at checkout for the operator to resolve, and never makes the cart unloadable.
- **Lines freeze** the variant id, a textual description snapshot, unit price with
  VAT, tax rate, discount and quantity, plus the base and tax computed at emission.
  The id keeps traceability; the text keeps the document readable after a rename.
- **A ticket-level discount is prorated across lines at emission** and only the
  distributed result is persisted, so the tax breakdown is correct by construction
  even when lines carry different rates.
- **Payments are a collection**, each with amount, method and an external transaction
  reference; cash payments also record the amount tendered, which is what the cash
  drawer reconciles against.
- **Series are entities.** Rectifying invoices legally require their own series, and
  simplified invoices are kept apart from full ones in practice, so day one needs
  three.
- **Returns are new documents** referencing the original, partial and per line, never
  a mutation. A returned faulty item is two facts: an entry movement and a shrinkage
  movement.
- **The customer is optional** (`customerId`, nullable) and **separate from the frozen
  fiscal block** the invoice carries. See ADR-0014 for why that separation is what
  makes GDPR erasure and fiscal retention coexist.
- **The seller is the authenticated user.** Manual attribution to a different person
  is falsifiable data covering a case (shared till logins) the design already avoids;
  it is a purely additive nullable column if commissions ever need it.

## Consequences

- Variant identity is a UUID, never the SKU: SKUs are mutable business identifiers and
  renaming one must not touch history.
- Product-level optimistic locking means two people editing different variants of the
  same product conflict. Irrelevant at this scale.
- Aggregate loads over-fetch for list screens; read models cover those (ADR-0005).

## Deliberately excluded

Lot, expiry and serial tracking (it would change the balance key from variant to
variant+lot); size-system equivalences (approximate, manufacturer-dependent, and only
needed for supplier imports); multi-category products (breaks per-category reporting
sums); goods in transit, stock reservations and inter-warehouse allocation rules;
catalog import (no standard format — a script against the API is the right shape).

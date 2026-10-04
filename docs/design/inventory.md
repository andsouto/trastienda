# Inventory

Block [3 of the roadmap](../roadmap.md#3-inventory), designed ahead of its code.

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

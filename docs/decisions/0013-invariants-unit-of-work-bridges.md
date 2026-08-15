# ADR-0013: Cross-aggregate invariants, UnitOfWork and inter-module bridges

- Status: accepted

## Context

Designing the model (ADR-0012) surfaced a set of rules that do not fit inside any
aggregate, and a UnitOfWork with more clients than ADR-0005 anticipated. Both need a
single criterion rather than a decision per case.

## Decision

### Invariants come in three tiers

**Tier 1 — inside the aggregate.** If the rule only involves data the aggregate owns,
it lives in `domain/`, is checked in memory and cannot be violated: variant
combination uniqueness, variant options matching the declared ones, ticket total
equalling the sum of its lines.

**Tier 2 — across aggregates: use case *plus a named mechanism*.** A check in a use
case is a race by default — you query, you decide, someone else acted in between. So
every cross-aggregate invariant is documented together with what actually protects it:

| Invariant | Mechanism |
|---|---|
| SKU uniqueness | Unique index; the prior query only produces a nicer error |
| Stock balance coherence | Row lock on `StockLevel` |
| Gapless numbering | Row lock on the series counter |
| Return not exceeding what was sold | Row lock on the original ticket |
| No cycles in the category tree | Ancestor walk; theoretical race accepted, given the frequency |
| Fiscal data present when issuing a full invoice | Query through the customers port; no race, the data does not change underneath |

"The use case validates it" with no mechanism named is a bug waiting to happen. Where
the answer is deliberately "nothing", as with category cycles, that is written down.

**Tier 3 — not an invariant, a policy.** Selling below available stock or below cost
changes per shop and admits explicit override, so it lives in `application/` and never
in `domain/`. Policy in the domain is what forces a recompile when the business
changes its mind.

### UnitOfWork

Clients, all of them within one transaction: a sale (ticket + payments + N movements,
locking N `StockLevel` rows and the series counter), a return (rectifying document +
entry movement, locking the original ticket), a receipt, a transfer (two movements),
and — once ADR-0014 lands — the facturación record and its chain link.

- **The port is typed per module** with an explicit context, so no DI container and no
  token registry: the sales use case receives a `SalesUnitOfWork` exposing exactly
  `{ tickets, series, stock }`, already bound to the transaction. Infrastructure
  implements it over `prisma.$transaction()`; the composition root wires it.
- **The transaction boundary is always the use case.** One per operation, never
  nested, never spanning HTTP requests.
- **Locks are acquired in a deterministic global order** — `StockLevel` rows sorted by
  id, then the series counter, then the chain — or concurrent sales touching the same
  two variants in opposite order will deadlock.
- **`READ COMMITTED`**: explicit row locks already do the work, and `SERIALIZABLE`
  would add retry logic on 40001 for nothing.
- **No external I/O inside a transaction.** Specifically, submission to the AEAT
  happens *outside*, via an **outbox**: the record is persisted with its hash inside
  the transaction and sent afterwards. A network call while holding stock locks and
  the series counter would let an AEAT outage freeze the shop.

Note the asymmetry, since the two cases look alike and are not: **no events between
sale and stock** (immediate consistency is non-negotiable — the gap would be phantom
stock), but **asynchrony towards the AEAT** (external system, cannot sit on the
critical path).

### Bridges between modules

`eslint-plugin-boundaries` forbids cross-module imports, and a sale must still
discount stock. The coupling is real — it is the business, not a design choice — so
the goal is to make it explicit, unidirectional and locatable.

- The consuming module **declares a port in its own vocabulary**
  (`sales/application/ports/stock.port.ts`, `registerSaleExit`), not a wrapper around
  what the other module offers.
- The adapter that translates it into the other module's use case imports **both**, so
  it lives in neither: it goes in **`src/bridges/`**, the only place allowed to import
  across modules, with an explicit exception in the boundaries config. No module may
  import `bridges`.
- Adapters are built per transaction, over tx-bound repositories, so they take part in
  the caller's transaction without the caller knowing.

The payoff is concrete: sales use cases are tested against a five-line fake port, with
no inventory and no database.

## Consequences

- Ticket emission serialises against other emissions (series counter, and later the
  hash chain). Irrelevant at counter scale; worth knowing before discovering it.
- A growing `bridges/` directory is not the pattern failing — it means the module
  boundaries are drawn wrong. It is a useful detector.

## Alternatives rejected

- **Domain events with eventual consistency between sale and stock**: buys scalability
  a small shop will never need, and pays with a window where the sale exists and the
  stock does not. Retries, dead letters and monitoring in a self-hosted single-binary
  product is a bad trade.
- **Merging sales and inventory into one module**: shorter today, but once two modules
  import each other freely, separating them again is expensive — and practising that
  separation is an explicit goal of ADR-0004.
- **A generic `UnitOfWork` handing out repositories by token**: a DI container in
  disguise, against ADR-0004.

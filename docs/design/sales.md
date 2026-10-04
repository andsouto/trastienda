# Sales

Block [4 of the roadmap](../roadmap.md#4-sales), designed ahead of its code.

- **A ticket is created already closed.** A fiscal document in draft state is a
  contradiction: it has no number, must have none, and pollutes every later query.
- **The cart lives outside the fiscal domain**: a thin, offline-first aggregate with
  client-generated idempotent line ids, several per user, deleted only by hand and
  never expiring. It stores *references, not prices* — a month-old cart must charge
  today's price, resolved at emission — and it reserves no stock. Because it outlives
  the catalog state it was built from, **stale references are a normal case, not an
  error**: a line whose variant was archived or discontinued in the meantime surfaces
  at checkout for the operator to resolve, and never makes the cart unloadable.
- **The cart syncs across devices** — scanning on a phone and charging on a tablet is
  an ordinary flow — so it is persisted server-side with a version, each device keeping
  a local copy and queueing changes while offline. The real pattern is a *sequential
  handover*, not concurrent editing, so a rejected version is resolved by reloading and
  reapplying; CRDTs would be machinery for a race that barely happens. Client-generated
  line ids are what keep a retry over a flaky connection from duplicating lines.
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

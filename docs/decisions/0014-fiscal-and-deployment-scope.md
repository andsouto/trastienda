# ADR-0014: Fiscal scope (Spain, VERI*FACTU) and single-tenant deployment

- Status: accepted

## Context

The product issues invoices in Spain, so Spanish invoicing law is a design input, not
a later feature. Royal Decree 1007/2023 and Order HAC/1177/2024 set requirements for
invoicing software; Royal Decree-law 15/2025 (2 December 2025) moved the deadlines to
**1 January 2027** for corporate income tax payers and **1 July 2027** for everyone
else (sole traders, non-residents with a permanent establishment, income-attribution
entities). Those already excluded via SII stay excluded.

## Decision

### Spain complete, generic only where it is free

Model *tax rate* and *tax regime* as concepts — never hardcode the word IVA or the
number 21 — so IGIC or another jurisdiction has a way in. Do not promise multi-country
support: the expensive part of internationalising is never the rates, it is the
invoicing rules (VERI*FACTU here, TicketBAI in the Basque Country, per-country
numbering and reporting formats), and that is a module per jurisdiction.

### Tax rates are editable configuration, seeded per country

Rates ship as seed data for Spain and the user can correct them; they are frozen into
each document when applied. **No internal table of historical rates**: rate history is
already stored inside the documents themselves, which is where it has evidential
value, and a shipped table would tie fiscal correctness to our release cadence — a
rate changing on 1 January while the shop upgrades in February would mean a month of
wrong invoices. VAT rates and their equalisation-surcharge counterparts are seeded as
pairs so they cannot be configured inconsistently.

### Both VAT regimes affect cost

- **General regime**: input VAT is deductible and is not part of cost.
- **Recargo de equivalencia**: the retailer pays VAT plus the surcharge to the
  supplier, files no VAT returns and deducts nothing, so **the full invoiced amount is
  acquisition cost**. This is not an edge case — it is the default for a sole trader
  running a shop, i.e. the majority of this product's users. It only affects the cost
  side: sales still charge VAT normally.

Consequence for the model: the entry movement stores **`unitCost` already resolved**.
The regime decides how it was computed at reception; it is never re-derived later,
because a shop can change regime and history must not shift underneath.

### VERI*FACTU mode, not the local alternative

Both modes require an issue and a cancellation record per invoice, hash chaining, and
a QR plus the corresponding legend on the invoice — and both apply to **simplified
invoices**, i.e. tickets. They differ sharply in cost:

| | VERI*FACTU (submitted) | Non-VERI*FACTU (local) |
|---|---|---|
| Electronic signature of records | Not required | Mandatory |
| Event log | Not required | Mandatory |
| Retention | Exempt — the AEAT keeps them | Mandatory for the full limitation period |

For a project of this size that is the difference between viable and not. The choice
is made tacitly by starting to submit records; the commitment runs at least to the end
of that calendar year.

### What this imposes on the sales model

- **Gapless correlative numbering per series.** A Postgres sequence does not roll back,
  so a failed transaction would leave a hole: the number comes from a locked counter
  row inside the transaction.
- **Chaining is per SIF, independent of series.** A SIF (*sistema informático de
  facturación*) is the regulation's term for the invoicing system itself. All records
  of one SIF chain together whatever their series. Modules that operate *in isolation*
  from each other chain — and submit — as separate SIFs.
- **Strict immutability**, with cancellation records and rectifying invoices in their
  own series.

### Offline tills are a separate SIF

**Continuing to sell through an internet outage is a design goal**, not an optional
extra: a shop that cannot charge because a router died is a shop that is closed. It is
scheduled as part of block 12 of the roadmap, but everything before it is shaped so
that it stays reachable.

A fully offline sale is possible precisely because chaining is per SIF: a till that
operates in isolation can be its own SIF, with its own chain and its own series. Three
earlier decisions already make it work — negative balances are allowed (an offline
till cannot consult the authoritative balance), the ledger orders by `occurredAt`, and
a ticket is born closed and therefore transportable as a complete fact.

The cost is that the till stops being a thin client (local catalog cache, hash
computation, QR generation, durable local storage, sync) and legally becomes a SIF of
its own. The discipline to keep meanwhile is that **the ticket aggregate must be
constructible from a complete set of facts, number and chain link included**, not only
through a flow that asks the server for the next number.

Emission logic would then exist on both sides, so it belongs in a shared workspace
package that api and admin both import — chain hashing, record structure and QR
generation are pure functions with no framework attached. This is independent of
ADR-0006: that decides how the API *contract* reaches consumers (generated from
OpenAPI, not a hand-written contracts package), which says nothing about sharing
logic. The constraint is that the package must be isomorphic — Web Crypto rather than
`node:crypto`, since one consumer is a browser.

The tempting shortcut — keep selling offline and issue everything on reconnection —
does not work: an invoice to a final consumer must be issued at the time of the
operation, so a deferred issue is a formal defect, not a delay.

### Personal data and fiscal retention

The right to erasure does not reach fiscal data (GDPR art. 17.3.b: processing required
to comply with a legal obligation). The model makes both coexist by applying the same
freezing rule used everywhere else:

- The **full invoice carries its own frozen copy** of the recipient's tax details, kept
  by legal obligation and untouchable — with VERI*FACTU the recipient's tax ID is in
  the submitted record anyway.
- The **customer record** (phone, email, marketing consent, loyalty history) is a
  different purpose with a different legal basis, and *that* is what gets erased: the
  record goes, `customerId` becomes null, and the invoice stays complete because it
  never depended on the record for its fiscal content.

### Single tenant

One deployment per business; the domain model carries no `tenantId`. Multi-tenancy
would touch every table, every query and the whole authorisation model, and for fiscal
software a cross-tenant bug is a legal incident, not a bug. If offering this as a
service ever makes sense, the operational saving is available through a database or
schema per customer with the same single-tenant code — orchestration, not a rewrite.

## Open questions

- **Declaración responsable.** Certification is self-certification by the producer,
  embedded in the product, and it also binds those who develop software for their own
  use. How that works for AGPL software that third parties deploy and modify is not
  resolved in the official sources; it needs advice before anyone invoices for real.
- **Legal disclaimer.** AGPL sections 15 and 16 already exclude warranty, but a note
  stating who assumes the responsible declaration in each deployment is warranted once
  the product is usable.

## Revisit trigger

Any change to the deadlines above, or a decision to support a second jurisdiction —
which means a new invoicing-rules module, not new configuration.

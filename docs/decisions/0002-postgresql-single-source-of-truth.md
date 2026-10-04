# ADR-0002: PostgreSQL as the single source of truth; stock as a movement ledger

## Context

The domain is strongly relational and transactional: products with variants
(size/color), stock, sales tickets, purchase invoices. A sale must atomically
decrement stock across N variants.

## Decision

- PostgreSQL is the only source of truth.
- Stock is modeled as a **ledger of movements** (goods receipt, sale, adjustment,
  return): the accounting source of truth, from which the balance is derived and always
  rebuildable. What holds and locks the balance is ADR-0012's.
- Flexible per-product attributes use JSONB columns.
- Photos/binaries go to object storage (S3/R2/MinIO); the DB stores only keys/URLs.
- Money is stored as integer cents, never floats.

## Rationale

ACID transactions and referential integrity are exactly what this domain needs. No use
case in scope is better served by NoSQL; adding it would be extra infrastructure with
no benefit. If the future public shop needs faceted search, add a derived index
(Meilisearch/Typesense) — never a second source of truth. Caching is explicitly out of
scope until there is a measured need.

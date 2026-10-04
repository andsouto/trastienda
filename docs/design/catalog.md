# Catalog

Block [2 of the roadmap](../roadmap.md#2-catalog), designed ahead of its code.

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

## Consequences

- Variant identity is a UUID, never the SKU: SKUs are mutable business identifiers and
  renaming one must not touch history.
- Product-level optimistic locking means two people editing different variants of the
  same product conflict. Irrelevant at this scale.

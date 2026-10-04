# Designs ahead of code

One file per roadmap block whose design was settled before writing it. They were
designed together, before any domain code, so that the aggregate boundaries, the
identifiers other modules reference and the facts that must be captured from day one
are settled: some choices here are cheap now and effectively irreversible later,
because they decide the *key* of a balance or the identity a document freezes.

Building a block consumes its design. When the block lands its file goes, once any
lasting *why* has moved to an ADR and any rule the code cannot enforce on its own to
CLAUDE.md. The rules these designs follow across modules are in
[ADR-0013](../decisions/0013-invariants-unit-of-work-bridges.md) (consistency) and
[ADR-0014](../decisions/0014-fiscal-and-deployment-scope.md) (fiscal).

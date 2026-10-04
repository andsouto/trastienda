# ADR-0011: "trastienda" as the project name

## Decision

**trastienda** — Spanish for the back room of a shop, which is exactly what the
product is. Repo name, npm scope `@trastienda/*`, package names.

## Rationale

Descriptive English names in this space are saturated (stockkeeper, backstock.dev,
etc. all collide with existing software). This one has personality, it is short and
simple, and nothing else in this space appears to use it.

Renaming costs ~15 minutes while nothing is published (GitHub auto-redirects renamed
repos, the npm scope is a find & replace). That stops being true once artifacts are
published and externally consumed, which is why the trademark scan in the roadmap
comes before them.

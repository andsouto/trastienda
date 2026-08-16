# ADR-0011: "trastienda" as the project name

- Status: accepted

## Context

Descriptive English names in this space are saturated (stockkeeper, backstock.dev,
etc. all collide with existing software). Naming was blocking repo creation, so the
name started as an explicitly provisional codename.

## Decision

**trastienda** — Spanish for the back room of a shop, which is exactly what the
product is. Repo name, npm scope `@trastienda/*`, package names.

Adopted as the definitive name in August 2026: it has personality, it is short and
simple, and nothing else in this space appears to use it. The codename framing is
dropped — there is no rename pending.

## Consequences

Renaming would have been ~15 minutes while nothing is published (GitHub auto-redirects
renamed repos, the npm scope is a find & replace) and that window stays open until
artifacts are published and externally consumed. Nothing depends on keeping it open.

The one item from the original checklist never carried out is a formal EUIPO/USPTO
trademark scan in the software class. Worth doing before publishing the first
artifacts — not because the name is in doubt, but because that is the moment it stops
being cheap to change.

# ADR-0011: "trastienda" as provisional codename

- Status: accepted (explicitly provisional)

## Context

Descriptive English names in this space are saturated (stockkeeper, backstock.dev,
etc. all collide with existing software). Naming was blocking repo creation.

## Decision

Use **trastienda** (Spanish for the back room of a shop — exactly what the product is)
as the working codename: repo name, npm scope `@trastienda/*`, package names.

## Rationale

Renaming is ~15 minutes while nothing is published: GitHub auto-redirects renamed
repos, and the npm scope is a find&replace. The name only becomes sticky once
artifacts (images, packages) are published and externally consumed — re-evaluate
before first public release. Checklist for a definitive name: GitHub + npmjs search,
domain, quick EUIPO/USPTO trademark scan in the software class.

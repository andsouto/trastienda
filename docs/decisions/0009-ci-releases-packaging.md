# ADR-0009: GitHub Actions + conventional commits + release-please; packaging ships with the app

- Status: accepted

## Context

Goal: maximum CI automation. GitHub Actions is free/unlimited for public repos and the
OSS default. Maintainer has prior experience with semantic-release in single-package
repos.

## Decision

- **CI**: GitHub Actions (lint, test, build on every PR).
- **Releases**: conventional commits + **release-please** (manifest mode). It keeps a
  release PR open with accumulated changelog/version bumps; merging it (auto-merge
  allowed for full automation) creates tags/releases, and tag-triggered workflows
  build artifacts.
- **Release artifacts, all living in this repo** (packaging is part of the product):
  multi-arch Docker images to GHCR, a docker-compose quickstart, a reference Kustomize
  base in `deploy/`, and a **Timoni module** published as an OCI artifact to GHCR.
  Kustomize remains the tool-neutral documented path; Timoni is offered alongside, not
  as the only official install method (adoption risk).
- The private environment repo holds only instance config (GitOps app-repo /
  env-repo split). CD design is deferred until deployment is real.

## Alternatives rejected

- **semantic-release**: monorepo support only via brittle community plugins.
- **Changesets**: monorepo-native but declaration-file-per-PR workflow; better suited
  to npm library constellations than to an app releasing Docker images. Re-evaluate if
  `contracts` becomes a published npm package with external consumers.
- **Helm**: maintainer dislikes it; Kustomize + Timoni cover the spectrum.

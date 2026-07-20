# ADR-0009: GitHub Actions + conventional commits + release-please; packaging ships with the app

- Status: accepted

## Context

Goal: maximum CI automation. GitHub Actions is free/unlimited for public repos and the
OSS default. Maintainer has prior experience with semantic-release in single-package
repos.

## Decision

- **CI**: GitHub Actions (lint, test, build on every PR).
- **Merging**: `main` only changes through a pull request with CI green; no direct
  pushes/commits to `main`, enforced by a branch protection ruleset (require PR,
  required status checks up to date, linear history, no force-push). Rebase merge only
  (merge commit and squash disabled at the repo level): commits land on `main` exactly
  as authored, so there is no editable merge-time textbox for the commit-message check
  below to miss. A branch/PR may still carry more than one related change — it just
  means every commit on it has to be a well-formed conventional commit, not that a PR
  is limited to one commit.
- **Commit messages**: every commit must follow Conventional Commits, checked in CI
  per commit (not just the PR title) via `wagoid/commitlint-github-action`, since
  rebase merge preserves each commit verbatim on `main`. release-please depends on
  this to generate the changelog and version bump correctly.
- **Releases**: conventional commits + **release-please** (manifest mode). It keeps a
  release PR open with accumulated changelog/version bumps; merging it creates
  tags/releases, and tag-triggered workflows build artifacts. Merge is manual and
  deliberate for now — nothing installable exists yet, so nothing should auto-publish.
  Repo-level auto-merge is a future option once there's a release worth shipping the
  moment it's ready, not a current setting.
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

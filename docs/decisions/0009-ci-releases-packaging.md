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
  deliberate — nothing installable exists yet, so nothing should auto-publish. The repo
  does allow auto-merge (Renovate uses it for dependency PRs), but nothing enables it on
  the release PR: publishing stays a human decision.
- **Dependency updates**: **Renovate** (Mend-hosted GitHub App, free for public repos),
  configured in `renovate.json` on the `config:best-practices` preset — npm updates wait 3
  days before being offered (window for a malicious publish to be caught), action versions
  are pinned to digests, abandoned packages get flagged. The wait stays npm-only, as the
  preset has it: extending `minimumReleaseAge` to the root so images got the same window
  was tried and reverted, because it forces Renovate to resolve a release timestamp for
  every candidate across the ~5.6k tags these images carry, which exhausted the hosted
  runner's 3 GB and killed every run with a kernel OOM. It also held Zitadel back forever
  on the way, since ghcr publishes no timestamp and an unknown one counts as too young.
  Images are pinned by digest and are development-only, so the window bought little to
  begin with. Commit types follow Renovate's default split, which matches what ships:
  runtime `dependencies` land as `fix(deps)`, so they bump the patch version and appear in
  the changelog — a Fastify or Prisma bump changes the artifact the user runs;
  devDependencies, workflow actions and lockfile maintenance land as `chore(deps)` and
  stay out of both. This decides what a release *contains*, not when it happens — that
  stays the manual merge above. **Updates automerge by default** once CI is green: the
  pipeline is the evidence (lint, typecheck, contract drift, tests, build), and nothing
  publishes itself, since the release PR above is merged by hand — an unattended
  `fix(deps)` reaches nobody until that decision is taken. Two exceptions wait for a
  human: **majors**, which are decisions rather than chores, and **Zitadel minors**,
  because nothing in CI boots it and it migrates its schema on start, so a bad bump fails
  silently and is not undone by reverting `compose.yaml` — it is checked by hand against
  the local stack instead. Automerge runs through GitHub's native auto-merge, which lands
  the PR the moment checks pass; the merge method is auto-detected from repo settings, and
  since the repo only allows rebase, linear history holds. No schedule window: PRs arrive
  when upstream publishes, the Dependency Dashboard is the control surface. Add a window
  if the volume ever becomes noise.
- **Versions are pinned exactly**, dependencies and devDependencies alike
  (`:pinAllExceptPeerDependencies`). These are applications, not published libraries:
  nothing downstream has to resolve our ranges, so the reason to keep them disappears.
  A lockfile pins the tree but hides direct-dependency drift from the diff; pinning puts
  every version change in a reviewable PR. `engines` stays a range.
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
- **Dependabot**: native and zero-setup, but its grouping is too coarse for a pnpm
  workspace and it ignores `mise.toml`.

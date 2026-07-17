# ADR-0010: AGPL-3.0

- Status: accepted

## Context

The product (API + admin) is open source and generic; it is deployable management
software, the category where SaaS-ification without contribution is the main risk
(same reasoning as Grafana, Mastodon, Nextcloud).

## Decision

AGPL-3.0 for this repository.

## Consequences (accepted knowingly)

- Commercial use, hosting and paid services remain fully allowed; what AGPL prevents
  is proprietary derivatives — anyone offering a modified version as a service must
  publish their changes. This is the explicit goal.
- Some corporations blanket-ban AGPL; losing that adoption is the accepted trade-off.
- Direction of compatibility: depending on MIT/Apache-2.0 libraries is fine.

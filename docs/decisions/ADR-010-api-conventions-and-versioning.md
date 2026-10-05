# ADR-010 — API conventions, errors and versioning

Status: Accepted (Stage 01, 2026-10-04)

## Decision
Adopt `docs/architecture/API_CONVENTIONS.md`: REST/JSON under `/api/v1`, household-nested resources, `*Cents` integer money, `*Bps` shares, `YYYY-MM-DD` dates, cursor pagination, `version`-based optimistic concurrency, single error envelope `{ error: { code, message, details?, requestId } }` with a shared code catalog, 404 for cross-household access, Swagger at `/api/docs`. URL versioning; breaking changes create `v2` routes.

## Consequences
+ Predictable contracts for the web app and a future mobile client.
− URL versioning duplicates routes on breaking changes (rare in MVP).

## Alternatives
- Header/media-type versioning: less discoverable; rejected.
- GraphQL: unnecessary for one client and mostly fixed screens.

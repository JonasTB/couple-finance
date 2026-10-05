# ADR-011 — Application-generated UUIDv7 identifiers

Status: Accepted (Stage 01, 2026-10-04)

## Decision
All primary keys are UUIDv7 generated in the application through an `IdGenerator` port (`uuid` package `v7()`), stored as PostgreSQL `uuid`. Ids are non-enumerable for clients, time-ordered for index locality, and known before insert (useful for audit events and aggregates with children). Cursor pagination still sorts by business keys (`date`, `id`).

## Alternatives
- `gen_random_uuid()` (v4) in DB: random index locality, id unknown before insert.
- Serial integers: enumerable; rejected for tenant-facing ids.

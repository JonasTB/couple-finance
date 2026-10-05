# ADR-003 — Date, instant and timezone semantics

Status: Accepted (Stage 01, 2026-10-04)

## Context
Users think in calendar days and months ("the condominium of October"). Servers run in UTC. Brazil has one dominant timezone but the product must not assume it.

## Decision
- **Date-only business facts** (transaction date, occurrence date, income effective dates, goal deadline, installment dates) are stored as PostgreSQL `date` and exchanged as `YYYY-MM-DD`. They carry **no timezone** and are never converted.
- **Instants** (createdAt, audit, token expiry) are `timestamptz`, exchanged as ISO-8601 UTC (`Z`).
- **Months** (`YYYY-MM`) are calendar months over date-only fields.
- Each household has an **IANA timezone** (default `America/Sao_Paulo`), used only to compute "today"/"current month" for that household (default form dates, overdue occurrences, current-month dashboards, insights).
- Date arithmetic lives in a `LocalDate` helper; month addition clamps the day to month end. (Amended by ADR-012: native helpers instead of `date-fns`.)
- The server process runs with `TZ=UTC`; the DB session timezone is UTC.
- A `Clock` port is injected so tests control "now".

## Consequences
+ No off-by-one-day bugs from UTC conversion of calendar dates.
+ Changing a household timezone does not rewrite any record.
− Two concepts (date vs instant) must be kept distinct in DTOs; enforced by validators (`@IsISO8601({ strict: true })` on dates with an explicit `YYYY-MM-DD` regex).

## Alternatives
- Store everything as `timestamptz`: causes day shifts around midnight and DST; rejected.

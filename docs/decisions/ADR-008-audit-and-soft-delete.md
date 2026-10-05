# ADR-008 — Audit trail and soft delete

Status: Accepted (Stage 01, 2026-10-04)

## Decision
- Financial records (transactions, allocations via their transaction, incomes, recurring expenses, installment plans, budgets, goals and contributions, purchase plans and items, settlements) use **soft delete** (`deleted_at`, `deleted_by_member_id`). Deleted rows are excluded from every calculation and can be restored.
- An append-only `audit_events` table records `CREATE | UPDATE | DELETE | RESTORE | RECALCULATE` with actor, request id, timestamp and `before`/`after` JSON snapshots of the aggregate (transaction snapshots include allocations).
- Audit events are written **by application services in the same database transaction** as the change (`AuditRecorder` in the unit of work). No ORM subscribers/triggers, so the actor and intent are explicit.
- Audit reads go through viewer-aware projection (hide `RATIO_ONLY` income amounts).
- Hard deletion happens only for LGPD erasure, which anonymizes the user (Q-04 accepted; `SECURITY_PRIVACY.md` §4).
- Not event sourcing: current state tables remain the source of truth.

## Amendments (Stage 04)
- `audit_events` has no foreign keys, so the trail survives anonymization or removal of what it references.
- Rows are written with parameterized SQL inside the caller's transaction (`AuditRecorder.record(tx, actor, entry)`); every event carries the request id.
- Snapshots never include secrets (token or password hashes).

## Consequences
+ "Who changed what" is answerable; history is never silently rewritten.
− Snapshot storage grows linearly with edits (acceptable at household scale).

## Alternatives
- Temporal tables / triggers: actor context in DB is awkward; rejected.
- Event sourcing: explicitly out of scope (CLAUDE.md).

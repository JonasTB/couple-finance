# ADR-007 — Recurrences and installments

Status: Accepted (Stage 01, 2026-10-04). Stage 07 refines details (edit/cancel flows).

## Decision

### Recurring expenses
- Stored as a template plus `RecurrenceRule` (`WEEKLY | MONTHLY | YEARLY`, `interval`, `dayOfMonth`, `startDate`, `endDate?`).
- **Occurrences are projected virtually** for a requested range, capped at 24 months; nothing is pre-created.
- A member **confirms** an occurrence, which materializes a normal transaction with origin `(recurringExpenseId, occurrenceDate)`; a partial unique index prevents duplicates. The confirmed amount may differ from the expected amount (variable expenses).
- Past unconfirmed occurrences are shown as "pendentes" (overdue); they do not count as spend until confirmed, but count as **projected commitment** in forward-looking views.
- No background scheduler in MVP. Auto-confirmation of `FIXED` occurrences is a roadmap option.
- Editing a recurring expense affects only future unconfirmed occurrences; confirmed transactions are edited individually.

### Installments
- An `InstallmentPlan` is finite (2–72), so its **installments are created eagerly** as transactions with origin `(installmentPlanId, installmentNumber)` in the same DB transaction.
- Rounding: remainder on installment 1 (`CALCULATIONS.md` §5). Input may be total or installment amount.
- Dates: `addMonthsClamped(firstDate, k-1)`.
- Each installment carries the plan's split snapshot and its own allocations.
- Cancellation / early payoff soft-deletes future installments (details Stage 07).
- Credit-card billing cycles are **not** modeled; the installment date is the reference for analytics.

## Consequences
+ No infinite records; analytics treat confirmed occurrences and installments as ordinary spend.
− Users must confirm variable recurring costs each period (desired: actual amounts are captured).

## Alternatives
- Cron that materializes N months ahead: needs a scheduler and creates speculative data; rejected for MVP.
- Installments as virtual projections: complicates per-installment edits and balances; rejected.

## Amendments (Stage 07 implementation, 2026-10-04)
1. **Origin without foreign keys**: `transactions` gets `recurring_expense_id + occurrence_date` and `installment_plan_id + installment_number + installment_count + installment_payoff`, guarded by check constraints and two partial unique indexes (`WHERE deleted_at IS NULL`). No FKs, so the ledger does not depend on the commitments modules (MODULES.md direction); the commitment services write both sides in one database transaction through `TransactionWriter`.
2. **Schedule**: the day of month (or weekday) is the day of `startDate`; there is no `day_of_month` column. Intervals 1–12. Occurrence windows are under 24 months per request.
3. **Skip**: an occurrence can be skipped (and reopened); confirming a skipped one un-skips it. Skips are their own small table, not transactions.
4. **Pause** is stored as windows `[from, to)` (jsonb on the template); status is derived. Occurrences inside a window are not expected; earlier overdue ones remain. **End** sets the last possible date (default today).
5. **Edits**: template changes apply to every open occurrence (overdue and upcoming); the schedule (frequency, interval, start date) locks after the first confirmation or skip, so history never moves (`RECURRENCE_SCHEDULE_LOCKED`).
6. **Confirmation**: amount, payment date and payer may differ from the template; the split rule (or the household default) is resolved on the payment date. Duplicates are impossible (row lock + unique index); a deleted confirmation reopens the occurrence.
7. **Installments**: the split is resolved once on the first installment date and re-applied to every installment (§5). Plans have no edit: installments are edited individually; a wrong plan is deleted (with its expenses) and created again.
8. **Early end** (FR-INST-04): `CANCEL` removes installments dated after a cut-off; `PAY_OFF` additionally records one payoff expense (actual amount, plan split, numbered as the first removed installment, `payoff = true`). Paid/remaining is date-based.
9. **Delete/restore a plan** removes and brings back exactly the expenses removed at that instant (the deletion instant is kept strictly after a previous close).

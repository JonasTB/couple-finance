# ADR-006 — Split allocation and historical basis

Status: Accepted (Stage 01, 2026-10-04)

## Context
Splits must reconcile exactly, be deterministic, survive income changes, and not leak private income.

## Decision
1. **Algorithm**: largest-remainder (Hamilton) over integer cents; ties by stable member order (`joinedAt`, `id`). Specified in `docs/domain/CALCULATIONS.md` §1–2.
2. **Persist allocations** (`transaction_allocations`) instead of recomputing on read: allocations are the financial fact; reads are cheap and history is stable.
3. **Snapshot**: each transaction stores `split_type` and `split_snapshot` (`weights` in bps or 1, `source`, `incomeBasisDate` for proportional). Raw incomes are never stored on transactions.
4. **Edits**:
   - Amount change → re-allocate with the stored weights.
   - Participant/rule change → compute a new snapshot from the new rule (for proportional, using income effective on the transaction date).
   - Date change → keep the snapshot (no silent basis change).
   - Explicit `recalculate-split` (single or date range) → recompute proportional bps from current income records; audited with action `RECALCULATE`.
5. **Defaults**: the household default split rule applies at creation time only; changing the default never rewrites past transactions.
6. **Defense in depth**: a deferred constraint trigger checks `Σ allocations = amount` at commit.
7. **Missing income** for a proportional participant → `422 INCOME_BASIS_MISSING` (Q-03 accepted; fallback to `EQUAL` rejected).

## Amendments (Stage 05 implementation, 2026-10-04)
1. **Where the math lives**: `common/money/allocation.ts` (largest remainder, BigInt, property-tested) is shared by `incomes` (income → bps) and `transactions` (`domain/split.ts`: `planSplit` → optional income bps → `allocateSplit`; `reallocate` for amount edits).
2. **Participants**: EQUAL and INCOME_PROPORTIONAL default to all active members and accept a subset; CUSTOM_PERCENT/CUSTOM_AMOUNT participants are the members listed. Output is always in stable member order.
3. **Snapshot weights**: bps (percent/proportional), 1 (equal/individual), **cents for CUSTOM_AMOUNT**. Changing the amount of a CUSTOM_AMOUNT expense therefore requires new per-person amounts (`SPLIT_SUM_MISMATCH` otherwise).
4. **Former members**: may appear on edits of expenses that already reference them (payer or allocation) but never on new expenses.
5. **Recalculation**: per expense (`POST …/{id}/recalculate-split`) and per date range (`POST …/transactions/recalculate-split`, all or nothing). Unchanged expenses are not rewritten or audited.
6. **Preview**: `POST …/transactions/preview-split` returns allocations without saving, so the web form never computes splits itself.
7. **Defense in depth** is implemented as a deferred constraint trigger (`assert_allocations_balance`) on both tables.

## Consequences
+ History is stable and explainable; privacy preserved.
− Retroactive income registration requires an explicit recalculation action (UX must offer it).

## Alternatives
- Compute allocations on read from rules: history would shift whenever income changes; rejected (rule 5).
- Round-half-even per member then patch the last member: deterministic but biased toward the last member; rejected.

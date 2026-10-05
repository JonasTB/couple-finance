# Business Rules & Invariants

Each rule states how it is enforced.

| # | Rule | Stage 01 resolution / enforcement |
|---|---|---|
| 1 | Payer and economic responsibility are independent. | `Transaction.payerMemberId` vs `SplitAllocation[]`; `INDIVIDUAL` may have payer ≠ responsible. |
| 2 | Split allocations must equal transaction total exactly after rounding. | Domain invariant in `Transaction`; property tests; DB constraint trigger as defense in depth (ADR-006). |
| 3 | Deterministic remainder allocation. | Largest remainder, ties by stable member order (`CALCULATIONS.md` §1). |
| 4 | Read/mutate household data only as an authorized member with sufficient role. | `HouseholdMembershipGuard` resolves active membership per request; permission matrix in ADR-005; cross-household → 404. |
| 5 | Historical income changes preserve the basis of past proportional splits. | Income records are effective-dated and non-overlapping; transactions store bps snapshot (ADR-006). |
| 6 | Editing a transaction does not silently change historical proportional allocations. | Amount edits re-allocate with the **stored** weights; new basis only via explicit `RECALCULATE` action, audited. |
| 7 | Individual expenses visibility per Stage 01 privacy decision. | **Decided:** visible to all household members (FR-TX-10). Model does not preclude a future private flag. |
| 8 | Contribution balance = paid − expected responsibility for period/scope. | `CALCULATIONS.md` §3; `Σ balances = 0`. |
| 9 | Avoid accusatory "owes" language. | Copy guidelines in `SECURITY_PRIVACY.md` §6; insight message keys reviewed. |
| 10 | Recurrences bounded/materialized on demand. | Virtual projection ≤ 24 months; materialize on confirm; unique `(recurringExpenseId, occurrenceDate)` (ADR-007). |
| 11 | Installment totals reconcile under explicit rounding. | Remainder on 1st installment; count 2–72; eager bounded creation (ADR-007). |
| 12 | Budgets are period-aware with unambiguous category scope. | Monthly `YearMonth` ranges, non-overlapping; category budget includes its subcategories; total budget = all shared spend. Stage 08: no rollover, shared scope only (ADR-014). |
| 13 | Insights include evidence and deterministic thresholds. | `ruleId`, `ruleVersion`, thresholds, evidence (`CALCULATIONS.md` §10). |
| 14 | LLMs never become source of financial truth. | No LLM in MVP; future copilot reads structured facts only. |
| 15 | Financial deletion preserves audit/history. | Soft delete + `AuditEvent` with before/after (ADR-008). Hard delete only for LGPD erasure, which anonymizes the user (Q-04 accepted; `SECURITY_PRIVACY.md` §4). |
| 16 | Documented timestamp/date semantics; periods use household timezone. | ADR-003. |
| 17 | Do not infer partner consent for sharing private financial information. | Income visibility per member, default `RATIO_ONLY`; changing it is an explicit action by the income owner. |
| 18 | Financial records reference `HouseholdMember`, not `User`. | Keeps history coherent when someone leaves or belongs to several households. |
| 19 | MVP households have at most 2 active members. | Configurable constant; enforced on invitation create and accept (ADR-005). |
| 20 | A household has exactly one currency; it is immutable once financial records exist. | Avoids FX; multi-currency is roadmap. |
| 21 | `INCOME_PROPORTIONAL` requires income for every participant on the transaction date. | Error `INCOME_BASIS_MISSING` (Q-03 accepted). |
| 22 | Only the income owner creates/edits their income. Partners see exact values only under `EXACT` visibility. | Enforced in `incomes` application service and in every read projection, including analytics and audit. |
| 23 | Concurrent edits do not overwrite each other. | `version` optimistic lock → 409 `VERSION_CONFLICT`. |
| 24 | A confirmed occurrence or installment is an ordinary transaction. | Analytics and balances need no special cases; origin fields only add traceability. |
| 25 | Archived categories remain valid on historical records but cannot be used on new or edited records. | `CATEGORY_ARCHIVED`. |
| 26 | Goals and settlements are bookkeeping; the app never moves money. | Product non-goal reaffirmed. |
| 27 | Income history only grows forward: a new record must start on/after the latest one (same date corrects it); history is fixed by removing the latest record, which reopens the previous one. | `IncomesService`; Postgres exclusion constraint forbids overlaps (Stage 05). |
| 28 | Archiving a category archives its subcategories; a subcategory cannot be restored while its parent is archived. Existing expenses keep archived categories. | `CategoriesService` (Stage 05). |
| 29 | A household currency is fixed at creation (MVP simplification of FR-HH-07). | No currency field in `PATCH /households/{id}`; revisit with multi-currency. |
| 30 | A settlement records a transfer made outside the app between two different members (active or former). It moves contribution balances only, never spend or shares. Any member records it; it cannot be edited (delete and record again), is soft-deleted and audited. | `SettlementsService`; `ck_settlements_distinct_members` (Stage 06). |
| 31 | The dashboard lists active members plus former members that still have figures (spend in the month or a cumulative balance). | `computeContribution` (Stage 06); keeps `Σ balances = 0` after someone leaves. |
| 32 | A settlement is suggested only when exactly two members carry a cumulative balance: the member below transfers the exact amount to the member above. | `suggestSettlement`; with N > 2 there is no single answer (Stage 06). |
| 33 | An occurrence is open until a member confirms it (one expense with the actual amount; the payment date may differ) or skips it. Deleting the confirmed expense reopens the occurrence; restoring it after a new confirmation fails with `OCCURRENCE_ALREADY_CONFIRMED`. Confirming a skipped occurrence un-skips it. | Partial unique index + row lock on the template (Stage 07). |
| 34 | Editing a recurring expense changes every **open** occurrence (overdue or upcoming); confirmed expenses are edited one by one. Frequency, interval and start date are locked once any occurrence was confirmed or skipped (`RECURRENCE_SCHEDULE_LOCKED`): end it and create another. | `RecurringExpensesService.update` (Stage 07). |
| 35 | Pausing starts today; occurrences inside a pause are not expected (never overdue). Resuming closes the pause today; a pause resumed on the day it started leaves no trace. Ending sets the last date an occurrence may fall on (default today) and closes an open pause. Earlier overdue occurrences stay until confirmed or skipped. | `domain/recurrence.ts` (Stage 07). |
| 36 | An installment plan resolves its split once, on the first installment date; every installment re-applies that snapshot, so later income changes never touch it. | `CALCULATIONS.md` §5; `TransactionWriter.resolveSnapshot` (Stage 07). |
| 37 | Closing a plan early: `CANCEL` soft-deletes the installments dated after the cut-off (default today); `PAY_OFF` also records one payoff expense with the amount actually paid, numbered as the first removed installment and counting for all of them. A closed plan cannot be closed again (`INSTALLMENT_PLAN_CLOSED`). | `InstallmentPlansService.close` (Stage 07). |
| 38 | Deleting a plan soft-deletes it and its live expenses at one instant; restoring brings back exactly those. Installments stay individually editable and deletable like any expense. | Stage 07. |
| 39 | An installment counts as paid when its date is on or before today (household time zone); card statements are not modeled. | ADR-007; `planProgress` (Stage 07). |
| 40 | A budget change applies from a month on (the current month or later); earlier months keep their amount and later scheduled changes are superseded. Removing a budget is a change to "no amount". | `planChange`; property-tested (Stage 08, ADR-014). |
| 41 | Budgets have no rollover: each month is measured against its own amount. | ADR-014 (user decision). |
| 42 | Budget alerts are in-app states (WARNING ≥ 80%, EXCEEDED ≥ 100%) shown with an icon and a label, never color alone. | Budgets page and dashboard card (Stage 08). |
| 43 | A goal never holds a negative amount; withdrawals, deletions and restores that would make it negative are rejected (`GOAL_INSUFFICIENT_BALANCE`). | `GoalsService`, row lock on the goal (Stage 09, ADR-015). |
| 44 | Goal entries are made by participants, dated today or earlier, never edited (delete and record again). | Stage 09. |
| 45 | Goal and plan statuses are derived (ACHIEVED / COMPLETED); archiving makes them read-only until restored. | ADR-015. |
| 46 | Buying a plan item records the actual price and may link an expense already recorded; it never creates ledger entries. | ADR-015 (no double counting). |
| 47 | FUTURE items stay out of the plan's estimate and remaining need; they are reported apart. | CALCULATIONS.md §9. |
| 48 | Analytics spend is the shared scope (split type ≠ INDIVIDUAL), like the dashboard and budgets; individual spend is reported apart. | ADR-016 (user decision). |
| 49 | Fixed spend = expenses created by a recurring expense (any amount type) or an installment plan; every other expense is variable. | ADR-016 (user decision); a manually entered fixed cost counts as variable. |
| 50 | Income commitment = fixed ÷ household income and shared spend ÷ household income, where household income is the sum of the active members' incomes on the month's last day; no ratio when any of them has no income. The income amount is shown only when every partner uses EXACT visibility. | ADR-016, ADR-005 (Q-02 caveat applies to ratios). |
| 51 | Averages use closed months on or after the household's first recorded expense; the comparison uses up to 3 months before the compared month. | CALCULATIONS.md §11. |
| 52 | Insights are computed on read by versioned deterministic rules; each carries rule id, version, thresholds, month, metrics and evidence that links to the underlying expenses. | ADR-017, CALCULATIONS.md §10. |
| 53 | Reductions (category below average, month-over-month decrease) are reported only for closed months; future months have no insights; endings of installment plans are announced for the current month. | ADR-017. |
| 54 | A contribution deviation is told from the member above plan, as context (INFO), with the categories and expenses behind it; copy never uses "deve"/debt framing. | ADR-017, ADR-005 §6. |
| 55 | Dismissing an insight hides it only for that user, that household and that fingerprint (rule + month + subject + qualifier); it can be undone. | `insight_dismissals` (Stage 11). |

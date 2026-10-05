# Deterministic Calculations

All formulas operate on integer minor units ("cents"). Intermediate products that may exceed `Number.MAX_SAFE_INTEGER` use `BigInt` (ADR-002). These algorithms live in domain code of the owning module and are the single source of truth for API, analytics and insights.

Notation: `A` = transaction amount in cents (integer, `A > 0`). Members are ordered by the **stable member order**: `HouseholdMember.joinedAt ASC, HouseholdMember.id ASC`. Every tie-break below uses this order.

---

## 1. Split allocation — largest remainder (ADR-006)

Input: amount `A`, participants `p_1..p_n` in stable order, non-negative integer weights `w_i` with `W = Σ w_i > 0`.

```
q_i   = floor(A * w_i / W)         // BigInt
r_i   = (A * w_i) mod W            // BigInt
R     = A - Σ q_i                  // 0 <= R < n
order participants by r_i DESC, then stable member order
give +1 cent to the first R participants of that ordering
allocation_i = q_i (+1 if selected)
```

Postconditions (property-tested): `Σ allocation_i = A`; `|allocation_i - A*w_i/W| < 1`; same input → same output.

### Weights by split type

| Split type | Participants | Weights | Validation |
|---|---|---|---|
| `EQUAL` | ≥1 active members (default: all active) | `1` each | — |
| `CUSTOM_PERCENT` | ≥1 | basis points (`10000` = 100%) | `Σ bps = 10000`, each `0..10000` |
| `CUSTOM_AMOUNT` | ≥1 | not used — amounts given directly | `Σ amounts = A` exactly else `SPLIT_SUM_MISMATCH` |
| `INDIVIDUAL` | exactly 1 (the responsible member) | `1` | responsible member is an active or historical member |
| `INCOME_PROPORTIONAL` | ≥1 | income-derived bps (see §2) | every participant has income effective at the transaction date |

### Example
`A = 10000` (R$ 100,00), `EQUAL` across 3 participants → `q = 3333` each, `R = 1`, all remainders equal → first member in stable order gets `3334`. Result `3334 / 3333 / 3333`.

---

## 2. Income-proportional basis (ADR-006)

1. For each participant, take the monthly income record effective on the transaction date (`effectiveFrom <= date AND (effectiveTo IS NULL OR date < effectiveTo)`).
2. Convert incomes to **basis points** with the same largest-remainder algorithm, distributing `10000` with weights = income cents.
3. Persist the bps on the transaction's split basis snapshot. **Raw income values are never stored on the transaction** (protects `RATIO_ONLY` visibility).
4. Allocate `A` with §1 using those bps.

Two-step rounding (income → bps → cents) is intentional: it is deterministic, privacy-preserving and keeps the stored basis self-sufficient for later recomputation of an edited amount.

Example: incomes R$ 6.000,00 and R$ 4.000,00 → bps `6000 / 4000`. For `A = 10001`: `q = 6000, 4000`, `r = 6000, 4000` (mod 10000), `R = 1` → the larger remainder wins → allocations `6001 / 4000`.

---

## 3. Contribution metrics for a period

Period = inclusive date range `[from, to]` over `Transaction.date` (date-only; months are calendar months, ADR-003). Only non-deleted transactions.

For member `m`:
```
paid_m        = Σ A(tx)                  where tx.payer = m
responsible_m = Σ allocation_m(tx)
balance_m     = paid_m - responsible_m + settledOut_m - settledIn_m
```
`settledOut_m` = settlements where `m` is the sender (`fromMemberId`), `settledIn_m` = where `m` is the receiver (Q-01 accepted). A settlement from the member behind to the member ahead moves both balances toward zero and never counts as spend.

Invariant: `Σ_m balance_m = 0` for any period (property-tested).

Shares on the dashboard use the **shared scope** (split type ≠ `INDIVIDUAL`) so that personal purchases do not distort "who carries the household":
```
paidShare_m        = paidShared_m        / Σ paidShared        (bps, largest remainder)
responsibleShare_m = responsibleShared_m / Σ responsibleShared (bps)
deviation_m        = paidShare_m - responsibleShare_m          (bps, signed)
```
The **balance** uses all transactions, because an `INDIVIDUAL` expense paid by the other member is a real contribution between partners.

- **Period balance**: balance for the selected range.
- **Cumulative balance**: balance from household creation to `to`. Always derived on read, never stored, so edits to history are reflected immediately and are explained by the audit trail (ADR-008).

---

## 4. Deviation attribution ("why did Alex pay 59%?")

For member `m` and each transaction in the shared scope:
```
delta_m(tx) = (tx.payer == m ? A : 0) - allocation_m(tx)
```
Group by category (top-level by default, subcategory on drill-down): `delta_m(c) = Σ delta_m(tx in c)`.
Rank categories by `delta_m(c)` descending for the member above plan (ascending for the member below), ties by category name then id. Return top 3 categories and top 5 transactions with their deltas as evidence.

Example output (pt-BR UI):
> Alex pagou 59% neste mês, frente a 50% planejado. A diferença veio principalmente de Condomínio (+R$ 600), Geladeira — parcela 3/10 (+R$ 310) e Supermercado (+R$ 290).

Because `Σ_m delta_m(tx) = 0` for every transaction, the explanation always reconciles with the balance.

**Implementation (Stage 06)** — `apps/api/src/modules/analytics/domain/contribution.ts`, property-tested:
- Shares (`paidShareBps`, `responsibleShareBps`, category `shareBps`) use §1 over `10000`; null when the month has no shared spend.
- The explanation is produced for every member whose `sharedDifferenceCents = paidShared − responsibleShared ≠ 0`; only items pushing in that member's direction are listed. Ties: categories by name then id; expenses by date (newest first) then id. The UI tells the story from the member above plan.
- Spend by category groups the shared scope by top-level category (subcategories roll up), largest first.
- The month is `[YYYY-MM-01, last day]`; without `month` the API uses the current month in the household time zone.
- Cumulative balances come from SQL aggregates (`transactions`, `transaction_allocations`, `settlements` up to the month's last day); the month's figures from its expenses in memory (bounded by one month).

---

## 5. Installments (ADR-007)

Input either `total T` or `installmentAmount I`, plus count `n` (2–72).
- From `I`: `T = I * n`; all installments equal `I`.
- From `T`: `base = floor(T / n)`, `rem = T - base*n`; installment 1 = `base + rem`; installments 2..n = `base`.

Example: `T = 100000`, `n = 3` → `33334, 33333, 33333`.

Dates: installment `k` date = `addMonthsClamped(firstDate, k-1)`, always computed from `firstDate` (never chained), clamping the day to the month's last day (31 Jan → 28/29 Feb → 31 Mar).

Each installment is a transaction allocated independently with §1 using the plan's split snapshot. Per-member sums across installments may differ by ≤ `n-1` cents from allocating `T` at once; this is accepted and documented.

Derived:
- `monthlyCommitment(month) = Σ installment amounts dated in month` (non-deleted, plan not cancelled).
- `releaseMonth(plan) = month after last installment`; "release timeline" groups plans by release month: "R$ 420/mês liberados em dezembro".

**Implementation (Stage 07)** — `apps/api/src/modules/installments/domain/installments.ts`, property-tested (Σ installments = total for every count/total):
- Exactly one of total or installment amount is accepted; a total needs at least 1 cent per installment.
- The released amount of a plan is its last live installment (what stops being charged); releases are listed only after the current month. The commitment covers the current month and the next 11.
- Paid/remaining is date-based (dated on or before today = paid); a payoff expense counts for the installments it replaced.

---

## 6. Recurring projections (ADR-007)

Occurrence dates for `MONTHLY` (interval k) with `dayOfMonth d`: `addMonthsClamped(startAnchor, i*k)` with day `d` clamped (Stage 07: `d` is the day of `startDate`, no separate column); `YEARLY` analogous; `WEEKLY` by 7-day steps. Projection window is `[from, to]` with `to - from ≤ 24 months`. Occurrences already materialized (unique `(recurringExpenseId, occurrenceDate)`) replace projected ones. Projected amount = `expectedAmount`; for `VARIABLE`, analytics label it as an estimate.

**Implementation (Stage 07)** — `apps/api/src/modules/recurring-expenses/domain/recurrence.ts`: confirmed (live expense), skipped, overdue (before today, open) and upcoming (today or later, open); open occurrences inside a pause window are omitted; confirmations outside a later-shortened schedule stay visible. The web asks for 12 months back to the end of next month.

---

## 7. Budgets

For month `M` and budget `b` effective in `M`:
```
spent      = Σ A(tx) where tx.date in M, shared scope, tx.category ∈ subtree(b.category) (or all if total budget)
remaining  = b.amount - spent            (may be negative)
usedBps    = floor(spent * 10000 / b.amount)
state      = usedBps >= 10000 ? EXCEEDED : usedBps >= 8000 ? WARNING : OK
```

**Implementation (Stage 08)** — `apps/api/src/modules/budgets/domain/budget.ts`: `usedBps` uses BigInt; months are whole calendar months (`monthBounds`); no rollover between months (ADR-014); a subcategory budget covers only that subcategory. Tests: threshold table, large amounts, and a property that a change from month M never alters any month before M.

---

## 8. Goals

```
saved          = Σ contributions - Σ withdrawals (non-deleted)
remaining      = max(target - saved, 0)
pace           = average net contribution per month over the last 3 complete months
                 (or since goal creation if shorter; current month excluded)
forecastMonths = pace > 0 ? ceil(remaining / pace) : null  → "sem previsão no ritmo atual"
requiredMonthly= deadline ? ceil(remaining / monthsUntil(deadline)) : null   (monthsUntil ≥ 1)
```

**Implementation (Stage 09)** — `apps/api/src/modules/goals/domain/goal.ts` (ADR-015): `monthsToGo` counts from next month, so `forecastMonth = currentMonth + monthsToGo`; `monthsUntil` counts the current month through the deadline month; integer divisions use BigInt; `progressBps` is capped at 10000. Tests cover zero/negative pace, first month, recent goals and passed deadlines.

---

## 9. Purchase plans

```
estimatedTotal = Σ estimatedPrice * quantity               (all items except FUTURE unless included)
actualTotal    = Σ paidPrice                                (PURCHASED items)
remainingNeed  = Σ estimatedPrice * quantity                (PENDING items)
variance       = actualTotal - Σ estimatedPrice*quantity of PURCHASED items
```

**Implementation (Stage 09)** — `apps/api/src/modules/purchase-plans/domain/purchase-plan.ts`: FUTURE items are reported separately (`futureCents`); goal coverage = ⌊saved × 10000 / remainingNeed⌋ capped at 10000 (null without remaining need). Property test: estimate = remaining need + estimate of purchased items.

---

## 10. Insight thresholds (MVP defaults, versioned in code)

| Rule id | Condition |
|---|---|
| `CATEGORY_ABOVE_AVERAGE` | category spend in month > 120% of its average over the previous 3 complete months, and absolute difference ≥ R$ 50 |
| `BUDGET_NEAR_LIMIT` | budget state `WARNING` or `EXCEEDED` |
| `INSTALLMENT_ENDING` | a plan's release month is within the next 2 months |
| `CONTRIBUTION_DEVIATION` | `|deviation_m| ≥ 500 bps` (5 p.p.) in the month |
| `DOMINANT_CATEGORY` | a top-level category ≥ 35% of shared spend in the month |
| `MOM_CHANGE` | total shared spend changes ≥ 25% vs previous month and ≥ R$ 200 |

Thresholds are constants with a rule version; each insight carries `{ ruleId, ruleVersion, thresholds, period, evidence }`.

**Implementation (Stage 11)** — `apps/api/src/modules/insights/domain/rules.ts` (ADR-017):
- "Average over the previous 3 complete months" uses the ADR-016 rule: up to 3, never before the first recorded expense; a zero average with ≥ R$ 50 of spend counts as new spending.
- Added for reductions (good news):
  - `CATEGORY_BELOW_AVERAGE` (< 80% of the average and ≥ R$ 50 less);
  - `MOM_CHANGE` downwards.
  Both are evaluated only for closed months.
- `CONTRIBUTION_DEVIATION` fires for the member at least 5 p.p. above plan (the partner mirrors it), with the §4 evidence.
- `INSTALLMENT_ENDING` is evaluated for the current month (releases in the next 2 months).
- Future months have no insights.
- Boundaries use BigInt products, so exactly 120% does not fire. Unit tests check every boundary.

---

## 11. Historical analytics (Stage 10, ADR-016)

Window = `N` calendar months ending at month `M` (1 ≤ N ≤ 24). Shared scope only (split type ≠ INDIVIDUAL); individual spend is reported apart.

```
spend(m)        = Σ A(tx) shared, tx.date in m
recurring(m)    = Σ A(tx) shared, tx created by a recurring expense
installment(m)  = Σ A(tx) shared, tx created by an installment plan     (installment load)
fixed(m)        = recurring(m) + installment(m);  other(m) = spend(m) − fixed(m)
change(m)       = spend(m) − spend(m−1);  changeBps = trunc(change × 10000 / spend(m−1))   (null if spend(m−1) = 0)
income(m)       = Σ active members' monthly income in effect on the last day of m      (null if anyone has none)
fixedBps(m)     = trunc(fixed(m) × 10000 / income(m));  spendBps(m) = trunc(spend(m) × 10000 / income(m))
paidShare/responsibleShare per member = largest remainder over 10000 (§1), as in §3
average         = floor(mean) over closed months (< current month) on or after the first recorded expense's month
comparison(M)   = spend(M) vs spend(M−1) and vs average of {M−3, M−2, M−1} ∩ [first expense month, …]; per category too
goalSaved(g, m) = Σ live entries of g dated ≤ last day of m  (null for months before g's creation month)
```

**Implementation (Stage 10)**: `apps/api/src/modules/analytics/domain/trends.ts`. It is property-tested: for every month, categories, spend kinds and member shares reconcile with the month's spend. Ratios use BigInt and truncate toward zero. Categories roll up to their top level, ordered largest first, then by name and id.

Example (hand-checked in the e2e test): Aug R$ 620, Sep R$ 1.120, Oct R$ 820.
- October vs September: −R$ 300, i.e. −30000 × 10000 / 112000 = −2678 bps (−26,78%).
- Average of the closed months since the first expense (Aug, Sep): R$ 870.
- With a household income of R$ 10.000, October's fixed R$ 420 gives 420 bps.

# ADR-016 — Analytics read model: scope, fixed vs variable, income commitment

Status: Accepted (Stage 10, 2026-10-05). Inputs: user decisions on 2026-10-05 (fixed vs variable by origin; income commitment shows both fixed and total; shared scope only).

## Context
FR-AN-01..04 ask for monthly, category and member trends, averages and month-over-month deltas, fixed vs variable spend, installment load, income commitment (respecting income visibility) and goal evolution, all computed on read (ADR-009). Three product questions changed the numbers and were put to the user.

## Decision

### Scope and endpoint
- One read model: `GET /households/{id}/analytics?month=YYYY-MM&months=N`.
  - The window ends at `month` (default: the current month in the household time zone) and covers `N` months.
  - `N` is 1–24 and defaults to 12 (ADR-009 bound).
- **Spend is the shared scope** (split type ≠ INDIVIDUAL). This is the same rule as the dashboard and budgets, so every month matches its dashboard. Individual spend is reported apart and enters no other figure. (User decision.)

### Fixed vs variable (user decision: by origin)
- **Fixed** = expenses created by confirming a recurring expense, whether its amount is FIXED or VARIABLE, plus expenses created by an installment plan.
- **Variable** ("avulsas") = every other expense.
- The month shows three parts: recurring, installments (the **installment load**) and other.
- Known limitation: an expense entered by hand (e.g. rent outside a recurring template) counts as variable. Rejected alternatives:
  - a fixed flag per category: needs a migration and a new screen, and cannot tell a one-off purchase apart;
  - FIXED recurring only: drops variable bills and installments from "fixed".

### Income commitment (user decision: both ratios)
- **Household income of a month**: the sum of the *active* members' monthly incomes in effect on the month's last day.
  - It is incomplete (no ratios) when any active member has no income on that date.
- **Two ratios per month, in bps truncated toward zero:**
  - fixed ÷ income;
  - shared spend ÷ income.
- **Privacy (ADR-005):**
  - Ratios are always returned. The Q-02 caveat applies: with two members a ratio can reveal the partner's income.
  - The income **amount** is returned only when every other active member has `EXACT` visibility (`incomeVisible`).
- The `incomes` module exposes `HouseholdIncome.totalsOn` for this. It returns amounts, so its callers own the visibility rule. `IncomeBasis` still returns bps only.

### Comparisons and averages
- **Month-over-month**: shared spend minus the previous month's, plus the ratio over the previous month (null when the previous month is 0, and for the window's first month).
- **Window averages** use the closed months of the window (before the current month) on or after the month of the household's first live expense. Months before the couple started recording never pull an average down. Rounded down.
- **Comparison card**: the window's last month against the previous month and against the average of up to 3 months right before it (same "since the first expense" rule).
  - It is done per top-level category too, which prepares the Stage 11 rule `CATEGORY_ABOVE_AVERAGE`.
  - Comparisons with the current month are labelled "em andamento", because it includes already-dated installments.
- **Shares** (paid vs planned per member per month) use largest remainder over 10000 (§1), like the dashboard. A month without shared spend has no shares.

### Goal evolution
- The amount saved at the end of each window month, for active and achieved goals; archived goals are left out.
- Months before the goal's creation month (app clock, ADR-015) are null, not zero.

### Implementation
- Two SQL aggregates over the partial `(household_id, date)` index:
  - spend per month × category × payer × scope × origin;
  - shared-scope responsibility per month × member.
- Plus the earliest live expense date. No new tables or indexes, no persisted aggregates (ADR-009).
- The fetch covers the window plus the 3 months before its last month.
- All arithmetic is in the pure `analytics/domain/trends.ts` (property-tested: categories, kinds and shares reconcile with each month's total).
- Web: Recharts (ADR-009 amendment 4), loaded only with the Análises page.
  - Spend kinds use one hue with ordered lightness (`--kind-1..3`), so they never read as member colors.
  - Members keep `--series-*`.
  - Every chart has a text summary and a table with the same numbers.

## Consequences
+ Numbers reconcile with the dashboard and budgets; fixed/variable needs no extra data entry.
+ Income amounts stay hidden under RATIO_ONLY; ratios work for everyone.
− Manually entered fixed costs show as variable until the couple uses recurring templates.
− Ratios can reveal a partner's income in a two-person household (accepted, Q-02).

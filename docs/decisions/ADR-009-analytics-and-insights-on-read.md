# ADR-009 — Analytics and insights computed on read

Status: Accepted (Stage 01, 2026-10-04)

## Decision
- Analytics are computed per request with SQL aggregates over canonical tables plus domain functions from the owning modules (`LedgerQuery`, `IncomeBasis`, `BudgetsQuery`, `InstallmentsQuery`, `CommitmentsQuery`). No persisted aggregates or materialized views in MVP.
- Requests are bounded (≤ 24 months per call).
- Insights are pure functions of analytics read models plus versioned rule thresholds (`CALCULATIONS.md` §10). They are not stored; only user dismissals are persisted (`insight_dismissals`, keyed by a fingerprint of rule id + period + subject).
- Messages are returned as `messageKey` + `params`; the web renders pt-BR copy following neutral-language guidelines.
- Revisit (new ADR) if p95 exceeds NFR-06 with realistic data.

## Consequences
+ No cache invalidation, edits reflected immediately, deterministic and testable.
− Repeated computation; acceptable at household data volumes.

## Amendments (Stage 06 implementation, 2026-10-04)
1. **Dashboard read model**: `GET /dashboard?month=` combines the month's expenses (loaded in memory, one month at most) with SQL aggregates for the cumulative balance (paid, responsible and settlement flows up to the month's last day, over the partial `(household_id, date)` indexes). All arithmetic runs in the pure `analytics/domain/contribution.ts`.
2. **Default month**: without `month`, the API answers for the current month in the household time zone (ADR-003), so clients never compute "today".
3. **Privacy**: the dashboard never reads incomes; planned responsibility comes from stored allocations, so `RATIO_ONLY` holds (ADR-005).
4. **Charts without a chart library**: the two Stage 06 visuals (paid vs planned share per member, spend by category) are plain HTML bars with direct labels. Recharts stays the choice for Stage 10 time series.

## Amendments (Stage 10 implementation, 2026-10-05)
5. **Historical analytics**: `GET /analytics?month=&months=` (≤ 24 months) is built from two monthly SQL aggregates over the ledger plus income totals and goal entries; arithmetic in `analytics/domain/trends.ts`. Scope, fixed vs variable and income commitment are decided in ADR-016.
6. **Recharts** is used for the analytics time series and loads only with that page (lazy route); the dashboard keeps its plain HTML bars.

## Amendments (Stage 11 implementation, 2026-10-05)
7. **Insights** read the dashboard, analytics comparison, budget status and installment releases for one month; rules live in `insights/domain/rules.ts` (ADR-017). The rule id (plus direction) is the message key and the typed `metrics` its parameters.
8. **Dismissal fingerprint** = `RULE:YYYY-MM:subject[:qualifier]`; the budget state and change direction are qualifiers, so a dismissed warning does not hide a later "exceeded".

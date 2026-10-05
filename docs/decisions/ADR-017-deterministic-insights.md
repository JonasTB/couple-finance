# ADR-017 — Deterministic insights: rules, periods, evidence and dismissals

Status: Accepted (Stage 11, 2026-10-05). It refines ADR-009 and CALCULATIONS.md §10; no new product decision was needed from the user.

## Context
- FR-INS-01..04 require deterministic rules with rule id, thresholds, period and evidence, neutral copy, and per-user dismissal.
- CALCULATIONS §10 fixed the thresholds.
- Stage 11 had to settle how the rules treat a running month, where the numbers come from, and what a dismissal hides.

## Decision

### Engine
- Insights are computed on read for one month (`GET /households/{id}/insights?month=`, default the current month in the household time zone).
- **Inputs** are the existing read models, so insights never re-implement a calculation:
  - the dashboard (shares, deviation explanation, categories);
  - the analytics comparison (previous month, 3-month average, per category);
  - budget status;
  - the installment release timeline.
- The rules are pure functions in `insights/domain/rules.ts`. Each rule has a version and constant thresholds, and every insight carries them.
  - Boundaries compare with BigInt products ("> 120%" is `cents × 10000 > average × 12000`), so there is no rounding at the edge.
- **Messages**: the API sends `ruleId` (plus `direction`), typed `metrics` and `evidence`, i.e. the message key and its parameters (ADR-009). The web writes the pt-BR copy in neutral language (ADR-005 §6) and explains each rule under "Por que este destaque?".

### Rules (version 1)
| Rule | Fires when | Severity |
|---|---|---|
| `CATEGORY_ABOVE_AVERAGE` | category > 120% of its average and ≥ R$ 50 more (a category new against a zero average counts) | ATTENTION |
| `CATEGORY_BELOW_AVERAGE` | category < 80% of its average and ≥ R$ 50 less — **closed months only** | INFO |
| `BUDGET_NEAR_LIMIT` | budget state WARNING (≥ 80%) or EXCEEDED (≥ 100%) | ATTENTION |
| `INSTALLMENT_ENDING` | a plan's release month is within the next 2 months — **current month only** (one insight per plan) | INFO |
| `CONTRIBUTION_DEVIATION` | a member's paid share is ≥ 5 p.p. above the planned share; told from that member, with the §4 evidence | INFO |
| `DOMINANT_CATEGORY` | a top-level category is ≥ 35% of the month's shared spend | INFO |
| `MOM_CHANGE` | shared spend changes ≥ 25% and ≥ R$ 200 vs the previous month (previous > 0); decreases **closed months only** | UP: ATTENTION, DOWN: INFO |

Notes on the table:
- The averages follow ADR-016: up to 3 months before the month, never before the first recorded expense.
- `CATEGORY_BELOW_AVERAGE` and decreases add the "meaningful reductions" asked for by the Stage 11 prompt, as good news.
- The contribution deviation is INFO on purpose: it is context, not a warning about a person.
- **Running month**: a reduction cannot be confirmed before the month ends, so reductions and decreases are evaluated only for closed months.
- **Future months** produce no insights.
- **Order**: ATTENTION first; then budgets, category increases, month change, deviation, dominant category, installments ending, category reductions; then by size.

### Fingerprints and dismissals
- **Fingerprint** = `RULE:YYYY-MM:subject[:qualifier]`:
  - subject is a category, member or plan id, `TOTAL` for the household budget, or `HOUSEHOLD`;
  - qualifier is the budget state or the change direction;
  - so dismissing a budget *warning* does not hide a later *exceeded*.
- **Dismissal is per user, per household and per fingerprint**, so it holds only for that month.
  - Table `insight_dismissals` (PK household + user + fingerprint, `dismissed_at` from the app clock).
  - `POST …/insights/dismissals` is idempotent; `DELETE …/insights/dismissals/{fingerprint}` undoes it.
  - The list still returns dismissed insights, with `dismissedAt` set, so the web can show them again.
- Dismissals are a viewing preference, not financial history, so they are not audited.

## Consequences
+ Every insight is reproducible from the same data and rule version, and links back to the expenses (NFR-08).
+ No stored insights: edits to history change insights immediately.
− A recurring pattern (e.g. rent as the dominant category) shows again each month after being dismissed.
− Several read models are computed per request; acceptable at household volumes (ADR-009).

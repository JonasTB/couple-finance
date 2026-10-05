# ADR-014 — Budget semantics: periods, no rollover, shared scope

Status: Accepted (Stage 08, 2026-10-04). Inputs: user decisions on 2026-10-04 — **no rollover**; **only shared expenses count**.

## Context
Stage 08 asked for explicit rollover semantics (FR-BUD-01..04) instead of an assumption, and FR-BUD-04 says budgets measure shared spend "by default".

## Decision
- **Budget line**: the household total (`category_id NULL`) or one category; a category budget includes its subcategories (a subcategory budget covers only itself).
- **Periods**: each line is a sequence of non-overlapping whole-month periods `[from_month, until_month)` (first days of months; `until_month` exclusive, null = open-ended), guarded by a Postgres exclusion constraint.
- **Changes from a month on** (FR-BUD-03): one command, "from month M the amount is X" (or null to remove). The running period is closed before M, periods starting at or after M are superseded (soft-deleted), and a new open-ended period starts at M. M must be the current month (household time zone) or later, so past months are never rewritten. A change that would not alter anything is a no-op.
- **No rollover**: each month is measured against its own amount. Unspent or exceeded amounts never carry into the next month.
- **Scope**: only shared expenses (split type ≠ `INDIVIDUAL`) count, for every budget; there is no per-budget option.
- **Status** (CALCULATIONS.md §7): `remaining = amount − spent` (may be negative), `usedBps = ⌊spent × 10000 / amount⌋` with BigInt, `WARNING ≥ 8000`, `EXCEEDED ≥ 10000`. Computed on read (ADR-009).
- **Alerts** are in-app states only (budgets page and a dashboard card), each with an icon and a label, never color alone. No notifications in MVP.
- **Archived categories**: existing budgets keep working and can be removed; new amounts for an archived category are rejected (`CATEGORY_ARCHIVED`).

## Consequences
+ Simple to explain ("each month starts from the amount set for it"); history stays stable.
+ The same append-forward shape as income history (BUSINESS_RULES 27).
− Couples who save on irregular categories (gifts, travel) cannot accumulate unspent amounts; Goals (Stage 09) cover saving explicitly.

## Alternatives considered
- Rollover of unspent amounts only, or of both surplus and overspend: rejected by the user for the MVP.
- Per-budget scope (shared vs all expenses): rejected by the user; can be added later as a column without migrating data.

# ADR-015 — Goals and purchase plans: bookkeeping rules and forecast details

Status: Accepted (Stage 09, 2026-10-04).

## Context
FR-GOAL-01..03 and FR-PP-01..04 plus CALCULATIONS.md §8–9 define the model; Stage 09 had to settle edge cases (negative balances, future entries, how the forecast counts months, how purchases relate to expenses).

## Decision

### Goals
- Bookkeeping only (BUSINESS_RULES 26): entries record money each member set aside elsewhere.
- **Participants**: one or more active members; only participants make entries. Former participants keep their entries.
- **Entries** (contribution / withdrawal) are dated today or earlier, never edited; they are soft-deleted and restorable. **A goal never holds a negative amount**: a withdrawal, deletion or restore that would make it negative is rejected (`GOAL_INSUFFICIENT_BALANCE`).
- **Status** is derived: `ARCHIVED` (archived_at set), `ACHIEVED` (saved ≥ target), else `ACTIVE`. Archived goals are read-only (`ARCHIVED`) until restored. Goals are archived, never deleted.
- **Forecast** (§8):
  - Pace: the average net amount over the last complete months, up to 3. The window never starts before the goal's creation month, and the current month is excluded. A goal in its first month has no forecast yet.
  - Months to go: ⌈remaining / pace⌉ using BigInt, counted from next month. A pace of zero or less gives "no forecast".
  - Required monthly: ⌈remaining / months left⌉, where months left counts the current month through the deadline month, with a minimum of 1. A passed deadline therefore asks for the whole remaining amount and is flagged.
- `created_at` of a goal is set from the application clock because it defines the first pace month.

### Purchase plans
- **Items** have:
  - name, unit estimate, quantity (1–999) and priority (HIGH/MEDIUM/LOW);
  - status `PENDING | PURCHASED | FUTURE`;
  - an optional responsible member, URL and notes.
- **Purchase** is a separate command:
  - It records the actual paid price for the whole line and the purchase date (today or earlier).
  - It may link an **already recorded** expense of the household (FR-PP-02). Nothing is created in the ledger, so spend is never duplicated.
  - "Undo purchase" returns the item to pending.
- **Totals** (§9):
  - estimate counts PENDING + PURCHASED items; FUTURE items are reported apart;
  - actual is the paid price of PURCHASED items;
  - remaining need is the estimate of PENDING items;
  - variance is actual − the estimate of PURCHASED items.
- **Status** is derived: `ARCHIVED`, or `COMPLETED` when something was bought and nothing is pending, else `ACTIVE`.
- **Goal link** (FR-PP-04): optional, only to an open goal of the same household. The plan shows the goal's saved amount and its coverage of the remaining need (bps, capped at 100%).
- A linked expense deleted later shows as unlinked; the paid price stays.

## Consequences
+ Deterministic, explainable numbers; no double counting with the ledger.
− Buying an item does not create the expense; the user records it in Despesas (or as an installment purchase) and links it.

## Alternatives considered
- Creating the expense when an item is bought: rejected — duplicates the expense form and its split rules, and risks double counting with installments.
- Allowing negative goal balances (a loan from the goal): rejected for clarity.

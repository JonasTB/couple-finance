# ADR-002 — Money as integer minor units

Status: Accepted (Stage 01, 2026-10-04)

## Context
Binary floating point cannot represent decimal cents exactly. Splits must reconcile to the cent. PostgreSQL `bigint` is returned by `node-postgres` as a string. JSON numbers are IEEE-754 doubles.

## Decision
1. **Domain & API**: amounts are integer minor units ("cents") in fields suffixed `Cents`, typed `number`, and required to satisfy `Number.isSafeInteger`. The maximum single amount accepted by the API is `99_999_999_999` cents (< R$ 1 bilhão), far below 2^53.
2. **Database**: `bigint` columns. A TypeORM column transformer converts string ↔ number and **throws** if the value is not a safe integer (no silent precision loss).
3. **Intermediate arithmetic** that multiplies amounts by weights (splits, proportions, bps) uses `BigInt`, then converts results back after asserting safety.
4. **Percentages** are integer basis points (`10000` = 100%).
5. **Currency**: one ISO 4217 currency per household, immutable once financial records exist. MVP allow-list: `BRL`, `USD`, `EUR` (all 2 minor units). Formatting via `Intl.NumberFormat` with household locale (pt-BR in MVP).
6. **Input parsing** of user-typed amounts ("1.234,56") happens in one tested web helper that produces cents; the API never accepts decimals.

## Consequences
+ Exact arithmetic and reconciliation, simple JSON.
− Every boundary must remember the `Cents` convention; enforced by naming and DTO validation (`@IsInt`, `@Min`, `@Max`).
− Supporting currencies with 0 or 3 minor units later requires a `minorUnits` field (non-breaking).

## Alternatives
- `numeric(14,2)` + decimal library (decimal.js): exact, but adds a dependency on every boundary and string handling in JSON. Not needed for 2-decimal currencies.
- Money as JSON string: avoids the 2^53 concern, which is irrelevant at our magnitudes.

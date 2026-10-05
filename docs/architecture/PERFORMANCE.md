# Performance baseline (NFR-06)

NFR-06: p95 < 300 ms for dashboard and list endpoints, with 5 years × 300 expenses/month in a household, on a modest instance; indexes justified by query plans.

## Method (Stage 12, 2026-10-05)
- **Data:** `pnpm db:seed:demo -- --profile=volume --reset` creates, through the public API, a couple with 60 months of data:
  - 17,760 one-off expenses;
  - 5 monthly recurring expenses, confirmed;
  - installment plans;
  - 18,076 expenses in total.
- **Server:** the API built for production (`node apps/api/dist/main.js`, `LOG_LEVEL=warn`) on a developer laptop, PostgreSQL 17 in Docker.
- **Load:** 30 sequential requests per endpoint, after 2 warm-up calls. The rate limit was raised for the run.

## Results
| Endpoint | p50 | p95 |
|---|---|---|
| `GET /dashboard` (current month) | 15.7 ms | 25.3 ms |
| `GET /dashboard?month=` (older month) | 10.1 ms | 13.6 ms |
| `GET /analytics?months=12` | 10.1 ms | 17.7 ms |
| `GET /analytics?months=24` | 15.4 ms | 90.6 ms |
| `GET /insights` | 29.1 ms | 45.7 ms |
| `GET /budgets` | 12.1 ms | 24.9 ms |
| `GET /transactions?limit=50` | 7.1 ms | 9.9 ms |
| `GET /transactions?q=` (text search) | 11.4 ms | 21.9 ms |
| `GET /transactions?categoryId=` | 10.2 ms | 29.0 ms |
| `GET /transactions?deleted=only` | 14.1 ms | 35.0 ms |
| `GET /installment-plans/summary` | 20.4 ms | 51.8 ms |
| `GET /recurring-expenses/occurrences` (14 months) | 13.5 ms | 27.2 ms |
| `GET /goals`, `/purchase-plans`, `/incomes` | 3–5 ms | ≤ 7 ms |

All endpoints are well under the target.

## Query plans
- The local table held essentially one household, so sequential scans were cheap and the timings alone could hide missing indexes. `EXPLAIN ANALYZE` was therefore checked per query.
- Reads of soft-deleted rows (the "Excluídas" list and restoring an installment plan) had no usable index; the existing indexes are partial on live rows.
  - Migration `AddTransactionLookupIndexes1791072900000` adds `ix_transactions_household_deleted`, which serves both queries: 11 ms → 0.02 ms.
  - A second candidate index (`installment_plan_id`) turned out redundant under EXPLAIN and was dropped.
- **N+1 review:** read paths batch their lookups (`IN (...)` for allocations, entries, summaries). The remaining loops with queries are bounded write paths: at most 72 installments per plan, the pending invitations of one household, and the proportional expenses of a recalculated range.

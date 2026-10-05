# API Conventions

See ADR-010.

## 1. Basics
- REST + JSON, UTF-8. Base path **`/api/v1`**. Swagger UI at `/api/docs` outside production; **disabled in production** (Stage 13, ADR-018).
- Health: `GET /api/health` (unversioned, unauthenticated, no dependencies leaked).
- Field names `camelCase`; enum values `UPPER_SNAKE_CASE`.
- Authentication: `Authorization: Bearer <accessToken>`; refresh via httpOnly cookie on `/api/v1/auth/*` only (ADR-004).

## 2. Resource layout
Household-owned resources are nested under the household; authorization is resolved from the path:

```
POST   /api/v1/auth/register | /login | /refresh | /logout   (all require X-Requested-With: couple-finance)
GET    /api/v1/me
PATCH  /api/v1/me                                (displayName)
GET    /api/v1/households                         (households of current user)
POST   /api/v1/households
GET    /api/v1/households/{householdId}
PATCH  /api/v1/households/{householdId}           (owner; requires version)
DELETE /api/v1/households/{householdId}           (owner; archive)
GET    /api/v1/households/{householdId}/members
DELETE /api/v1/households/{householdId}/members/{memberId}      (owner)
POST   /api/v1/households/{householdId}/leave
POST   /api/v1/households/{householdId}/transfer-ownership     (owner)
GET    /api/v1/households/{householdId}/invitations             (owner)
POST   /api/v1/households/{householdId}/invitations             (owner; returns token once)
DELETE /api/v1/households/{householdId}/invitations/{id}        (owner)
POST   /api/v1/invitations/preview                ({ token } in body; public, rate limited)
POST   /api/v1/invitations/accept                 ({ token } in body, never in logs)
PATCH  /api/v1/households/{householdId}/members/me                  (own income visibility)
GET    /api/v1/households/{householdId}/categories?includeArchived=
POST   /api/v1/households/{householdId}/categories
PATCH  /api/v1/households/{householdId}/categories/{id}             (rename / archive / restore)
GET    /api/v1/households/{householdId}/incomes?date=                (viewer-aware overview)
GET    /api/v1/households/{householdId}/incomes/me
POST   /api/v1/households/{householdId}/incomes/me
DELETE /api/v1/households/{householdId}/incomes/me/{recordId}       (latest only)
POST   /api/v1/households/{householdId}/transactions/preview-split
POST   /api/v1/households/{householdId}/transactions/recalculate-split   ({ from, to })
GET    /api/v1/households/{householdId}/transactions/{id}/history
GET    /api/v1/households/{householdId}/transactions?from=&to=&categoryId=&payerMemberId=&cursor=&limit=
POST   /api/v1/households/{householdId}/transactions
PATCH  /api/v1/households/{householdId}/transactions/{id}
DELETE /api/v1/households/{householdId}/transactions/{id}         (soft delete)
POST   /api/v1/households/{householdId}/transactions/{id}/restore
POST   /api/v1/households/{householdId}/transactions/{id}/recalculate-split
GET    /api/v1/households/{householdId}/dashboard?month=YYYY-MM     (month optional: current month in the household time zone)
GET    /api/v1/households/{householdId}/analytics?month=YYYY-MM&months=N  (window of N = 1–24 months ending at month; defaults: current month, 12)
GET    /api/v1/households/{householdId}/insights?month=YYYY-MM      (deterministic insights; dismissed ones flagged for the caller)
POST   /api/v1/households/{householdId}/insights/dismissals         ({ fingerprint }; 204, idempotent, per user)
DELETE /api/v1/households/{householdId}/insights/dismissals/{fingerprint}  (204; undo)
GET    /api/v1/households/{householdId}/settlements?from=&to=&deleted=only
GET    /api/v1/households/{householdId}/recurring-expenses?deleted=only
POST   /api/v1/households/{householdId}/recurring-expenses
GET    /api/v1/households/{householdId}/recurring-expenses/occurrences?from=&to=   (window < 24 months)
GET    /api/v1/households/{householdId}/recurring-expenses/{id}
PATCH  /api/v1/households/{householdId}/recurring-expenses/{id}          (version; schedule locked after a confirmation/skip)
POST   /api/v1/households/{householdId}/recurring-expenses/{id}/pause | /resume | /end ({ lastDate? }) | /restore
DELETE /api/v1/households/{householdId}/recurring-expenses/{id}
POST   /api/v1/households/{householdId}/recurring-expenses/{id}/occurrences/{date}/confirm   (→ { transactionId })
POST   /api/v1/households/{householdId}/recurring-expenses/{id}/occurrences/{date}/skip
DELETE /api/v1/households/{householdId}/recurring-expenses/{id}/occurrences/{date}/skip
GET    /api/v1/households/{householdId}/budgets?month=YYYY-MM           (status of the month; default current)
POST   /api/v1/households/{householdId}/budgets/changes                 ({ categoryId|null, amountCents|null, fromMonth }, current month or later)
GET    /api/v1/households/{householdId}/goals                            (with progress and forecast)
POST   /api/v1/households/{householdId}/goals
GET    /api/v1/households/{householdId}/goals/{id}                       (with entries)
PATCH  /api/v1/households/{householdId}/goals/{id}                       (version)
POST   /api/v1/households/{householdId}/goals/{id}/archive | /restore
POST   /api/v1/households/{householdId}/goals/{id}/entries               (contribution / withdrawal)
DELETE /api/v1/households/{householdId}/goals/{id}/entries/{entryId}     (soft; POST …/restore)
GET    /api/v1/households/{householdId}/purchase-plans                   (with totals)
POST   /api/v1/households/{householdId}/purchase-plans
GET    /api/v1/households/{householdId}/purchase-plans/{id}              (with items)
PATCH  /api/v1/households/{householdId}/purchase-plans/{id}              (version)
POST   /api/v1/households/{householdId}/purchase-plans/{id}/archive | /restore
POST   /api/v1/households/{householdId}/purchase-plans/{id}/items
PATCH  /api/v1/households/{householdId}/purchase-plans/{id}/items/{itemId}            (version)
POST   /api/v1/households/{householdId}/purchase-plans/{id}/items/{itemId}/purchase   ({ paidPriceCents, purchasedAt?, transactionId? })
POST   /api/v1/households/{householdId}/purchase-plans/{id}/items/{itemId}/unpurchase
DELETE /api/v1/households/{householdId}/purchase-plans/{id}/items/{itemId}            (soft; POST …/restore)
GET    /api/v1/households/{householdId}/installment-plans?deleted=only
POST   /api/v1/households/{householdId}/installment-plans               (creates every installment)
GET    /api/v1/households/{householdId}/installment-plans/summary       (12-month commitment + releases)
GET    /api/v1/households/{householdId}/installment-plans/{id}          (with installments)
POST   /api/v1/households/{householdId}/installment-plans/{id}/close    ({ kind: CANCEL|PAY_OFF, date?, payoffAmountCents? })
DELETE /api/v1/households/{householdId}/installment-plans/{id}          (plan and its expenses)
POST   /api/v1/households/{householdId}/installment-plans/{id}/restore
POST   /api/v1/households/{householdId}/settlements
DELETE /api/v1/households/{householdId}/settlements/{id}          (soft delete)
POST   /api/v1/households/{householdId}/settlements/{id}/restore
...
```
Commands that are not CRUD use a sub-resource verb (`/restore`, `/confirm`, `/recalculate-split`, `/transfer-ownership`).

## 3. Data formats

| Kind | Format | Example |
|---|---|---|
| Money | integer minor units, field suffix `Cents`; currency from household | `"amountCents": 123456` |
| Percent / share | integer basis points, suffix `Bps` | `"paidShareBps": 5900` |
| Date-only | `YYYY-MM-DD` | `"date": "2026-10-04"` |
| Month | `YYYY-MM` | `"month": "2026-10"` |
| Instant | ISO-8601 UTC with `Z` | `"createdAt": "2026-10-04T13:05:12.345Z"` |
| Id | UUID string | |

Requests with fractional or non-integer money are rejected (`VALIDATION_FAILED`). Unknown properties are rejected (`whitelist + forbidNonWhitelisted`).

## 4. Pagination
Cursor-based for unbounded lists (transactions, audit): `?limit=` (default 50, max 100) and `?cursor=` (opaque base64url of the sort key). Response:
```json
{ "data": [ ... ], "page": { "nextCursor": "eyJk...", "limit": 50 } }
```
Small bounded lists (members, categories, budgets) return `{ "data": [...] }` without pagination.

## 5. Concurrency
Editable financial resources expose `version`. `PATCH` bodies must include the `version` read; mismatch → `409 VERSION_CONFLICT` with the current resource in `details.current`.

## 6. Error envelope
```json
{
  "error": {
    "code": "SPLIT_SUM_MISMATCH",
    "message": "Split amounts must add up to the transaction amount.",
    "details": { "expectedCents": 10000, "actualCents": 9999 },
    "requestId": "01J9…"
  }
}
```
- `code` is stable and machine-readable (catalog in `packages/shared`); `message` is English for developers; the web app maps `code` → pt-BR copy.
- Never include stack traces, SQL, or other members' hidden data in `details`.

| HTTP | Typical codes |
|---|---|
| 400 | `VALIDATION_FAILED` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` (refresh and retry once), `INVALID_CREDENTIALS`, `REFRESH_TOKEN_ROTATED` (concurrent refresh: retry once) |
| 403 | `FORBIDDEN` (member of the household but lacks role), `INVITATION_EMAIL_MISMATCH` |
| 404 | `NOT_FOUND` (also for resources in households the user is not a member of) |
| 409 | `CATEGORY_NAME_TAKEN`, `VERSION_CONFLICT`, `EMAIL_ALREADY_REGISTERED`, `OCCURRENCE_ALREADY_CONFIRMED`, `HOUSEHOLD_FULL`, `ALREADY_MEMBER`, `OWNERSHIP_TRANSFER_REQUIRED` |
| 422 | `SPLIT_SUM_MISMATCH`, `INCOME_BASIS_MISSING`, `CATEGORY_ARCHIVED`, `INVITATION_INVALID` |
| 429 | `RATE_LIMITED` (with a standard `Retry-After` header) |
| 500 | `INTERNAL_ERROR` |

## 7. Versioning policy
Additive changes (new fields, endpoints, enum values documented as open) stay in `v1`. Breaking changes require `v2` routes for the affected resources. Single first-party client in MVP, so deprecation windows are short but documented in Swagger.

## 8. Privacy-aware projections
Responses are shaped per viewer. Example: another member's income with `RATIO_ONLY` returns `{ "memberId": "…", "visibility": "RATIO_ONLY", "shareBps": 6000 }` without `monthlyAmountCents`. Analytics endpoints follow the same rule (ADR-005).

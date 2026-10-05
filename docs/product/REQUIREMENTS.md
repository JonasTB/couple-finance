# Requirements

Source documents: `PRODUCT_SPEC.md`, `USER_JOURNEYS.md`, `docs/domain/*`.
Each requirement has a stable ID. Open items and limitations: [`../ROADMAP.md`](../ROADMAP.md).

Conventions: **MUST** = MVP acceptance criterion; **SHOULD** = MVP unless it threatens the stage; **LATER** = roadmap, not MVP.

---

## 1. Actors

| Actor | Description |
|---|---|
| Visitor | Unauthenticated person. Can register, log in, open an invitation link. |
| User | Authenticated person. May belong to zero or more households. |
| Owner | Household member with administrative rights (created the household or received ownership). |
| Member | Household member with full financial read/write rights, no administrative rights. |
| System | Deterministic backend services (allocation, projections, analytics, insights). Never an LLM in MVP. |

Role semantics are defined in ADR-005.

---

## 2. Functional requirements

### 2.1 Identity & access (AUTH)
- **FR-AUTH-01** MUST: register with email, password and display name. Email is unique case-insensitively.
- **FR-AUTH-02** MUST: log in with email and password; receive a short-lived access token and a rotating refresh token (ADR-004).
- **FR-AUTH-03** MUST: refresh the session; refresh-token reuse revokes the whole token family.
- **FR-AUTH-04** MUST: log out (revoke current refresh token family).
- **FR-AUTH-05** MUST: read and update own profile (display name). Email change is LATER.
- **FR-AUTH-06** MUST: rate-limit register/login/refresh/invitation-accept.
- **FR-AUTH-07** LATER (Q-05 accepted: no email provider in MVP): email verification and password reset.

### 2.2 Household & membership (HH)
- **FR-HH-01** MUST: create a household with name, currency (ISO 4217, default `BRL`), IANA timezone (default `America/Sao_Paulo`) and default split rule. Creator becomes Owner.
- **FR-HH-02** MUST: a user can belong to multiple households and switch between them.
- **FR-HH-03** MUST: Owner creates an invitation for an email; system returns a single-use, expiring link (7 days). Delivery is copy/share by the inviter in MVP (no email provider; ADR-004).
- **FR-HH-04** MUST: an authenticated user whose account email matches the invitation email accepts it and becomes Member.
- **FR-HH-05** MUST: Owner can revoke a pending invitation; expired/revoked/used invitations cannot be accepted.
- **FR-HH-06** MUST: the MVP limits active members to 2 per household (configurable constant; data model is N-ary). See ADR-005.
- **FR-HH-07** MUST: Owner edits household name, timezone and default split rule. Currency is immutable once any financial record exists.
- **FR-HH-08** MUST: a Member may leave; Owner may remove a Member; Owner must transfer ownership before leaving a household that still has other active members. History of former members is preserved.
- **FR-HH-09** SHOULD: Owner may soft-delete (archive) a household.

### 2.3 Categories (CAT)
- **FR-CAT-01** MUST: every household is seeded with a default pt-BR category set (two levels: category → subcategory).
- **FR-CAT-02** MUST: members create, rename and archive categories/subcategories. Archived categories are kept for history and hidden from pickers.
- **FR-CAT-03** MUST: category names are unique per (household, parent), case-insensitive.

### 2.4 Income (INC)
- **FR-INC-01** MUST: a member registers their own monthly income with an effective-from date; a new record closes the previous one (no overlapping periods).
- **FR-INC-02** MUST: income history is preserved; past proportional allocations keep their snapshot basis (ADR-006).
- **FR-INC-03** MUST: each member chooses income visibility: `EXACT` (partner sees amounts) or `RATIO_ONLY` (partner sees only resulting proportions). Default `RATIO_ONLY`. See ADR-005 and the inference caveat.
- **FR-INC-04** MUST: only the member themselves can create/edit/delete their income.

### 2.5 Transactions & splits (TX)
- **FR-TX-01** MUST: create an expense with description, amount, date, category, payer (member), split rule, payment method, optional notes/tags.
- **FR-TX-02** MUST: split rules: `EQUAL`, `INCOME_PROPORTIONAL`, `CUSTOM_PERCENT`, `CUSTOM_AMOUNT`, `INDIVIDUAL`. The transaction uses the household default unless overridden.
- **FR-TX-03** MUST: allocations always sum exactly to the amount, using the deterministic largest-remainder rule (ADR-006).
- **FR-TX-04** MUST: payer and responsible member(s) are independent; an `INDIVIDUAL` expense may be paid by the other member.
- **FR-TX-05** MUST: list transactions with filters (period, category, payer, responsible member, split type, payment method, text) and cursor pagination.
- **FR-TX-06** MUST: edit a transaction with optimistic concurrency (`version`). Editing does not silently recompute the split basis (ADR-006).
- **FR-TX-07** MUST: soft-delete and restore a transaction; deleted transactions are excluded from all calculations; every mutation is audited (ADR-008).
- **FR-TX-08** SHOULD: explicit "recalculate proportional split" action for one transaction or a date range, using income effective at each transaction date; audited.
- **FR-TX-09** MUST: payment method is informational (`CASH`, `DEBIT_CARD`, `CREDIT_CARD`, `PIX`, `BANK_TRANSFER`, `BOLETO`, `OTHER`). No payment is initiated.
- **FR-TX-10** MUST: all members see all transactions of the household, including `INDIVIDUAL` ones (Stage 01 decision; ADR-005).

### 2.6 Dashboard & contribution (DASH)
- **FR-DASH-01** MUST: for a selected month (household timezone), show total shared spend, spend by category, amount paid per member and paid share (%).
- **FR-DASH-02** MUST: show each member's planned responsibility share vs actual paid share, and the deviation.
- **FR-DASH-03** MUST: explain the deviation with the top categories and top transactions contributing to it, each with its amount (deterministic attribution; `docs/domain/CALCULATIONS.md` §4).
- **FR-DASH-04** MUST: show the contribution balance for the period and cumulative since household creation, in neutral language.
- **FR-DASH-05** MUST: empty states guide the user to the next action (create household → invite → first transaction).
- **FR-DASH-06** MUST (Q-01 accepted): record a settlement ("acerto") between members that affects only the contribution balance.

### 2.7 Recurring expenses (REC)
- **FR-REC-01** MUST: create a recurring expense (description, category, expected amount, fixed/variable, frequency, start/end, day, default payer, split rule, payment method).
- **FR-REC-02** MUST: occurrences are projected virtually within a bounded window (max 24 months) and never pre-created indefinitely (ADR-007).
- **FR-REC-03** MUST: a member confirms an occurrence, which materializes one transaction (actual amount may differ for variable expenses). Duplicate materialization of the same occurrence is impossible.
- **FR-REC-04** MUST: pause, resume, end and edit a recurring expense; edits affect future, unconfirmed occurrences only.
- **FR-REC-05** MUST: show upcoming and overdue (unconfirmed past) occurrences.

### 2.8 Installments (INST)
- **FR-INST-01** MUST: create an installment purchase from either total amount or installment amount, with count (2–72) and first installment date.
- **FR-INST-02** MUST: installment amounts reconcile to the total by an explicit rounding rule (remainder on first installment; ADR-007).
- **FR-INST-03** MUST: show paid/remaining installments, monthly commitment and release timeline ("R$ 420/mês liberados em dezembro").
- **FR-INST-04** SHOULD: early payoff / cancellation of remaining installments (details in Stage 07).

### 2.9 Budgets (BUD)
- **FR-BUD-01** MUST: define a monthly budget for the household total or for a category (includes its subcategories).
- **FR-BUD-02** MUST: show spent, remaining, % used; in-app alert states at ≥80% and ≥100%.
- **FR-BUD-03** MUST: budget changes are effective from a month onward and do not rewrite past months.
- **FR-BUD-04** MUST: budgets measure shared spend (split ≠ `INDIVIDUAL`) by default.
- Stage 08 decisions (ADR-014): no rollover between months; shared spend is the only scope.

### 2.10 Goals (GOAL)
- **FR-GOAL-01** MUST: create a goal with name, target amount, optional deadline and participants.
- **FR-GOAL-02** MUST: record contributions and withdrawals per member (bookkeeping only; no money moves).
- **FR-GOAL-03** MUST: show progress and deterministic forecast (completion date at current pace; required monthly amount to meet deadline).

### 2.11 Purchase plans (PP)
- **FR-PP-01** MUST: create a purchase plan (e.g. "Casita") with items: name, estimated price, quantity, priority, status (`PENDING`, `PURCHASED`, `FUTURE`), responsible member, optional URL/notes.
- **FR-PP-02** MUST: mark an item purchased with actual price and optionally link the expense transaction.
- **FR-PP-03** MUST: show estimated vs actual totals and remaining required amount (pending items).
- **FR-PP-04** SHOULD: associate a plan with a goal.

### 2.12 Analytics (AN)
- **FR-AN-01** MUST: monthly spend trend, category breakdown, member payments, planned vs actual contribution over time.
- **FR-AN-02** MUST: fixed vs variable spend, installment load, income commitment (% of household income committed), respecting income visibility.
- **FR-AN-03** MUST: goal evolution.
- **FR-AN-04** MUST: analytics are computed on read from canonical data; no stale persisted aggregates in MVP (ADR-009).

### 2.13 Insights (INS)
- **FR-INS-01** MUST: deterministic rules: category >20% above its 3-month average; budget ≥80%; installment ending within N months; contribution deviation above threshold; dominant category; significant month-over-month change.
- **FR-INS-02** MUST: each insight exposes rule id, thresholds, period and evidence (metrics and transaction/category references).
- **FR-INS-03** MUST: copy is neutral (no "deve"/"owes" framing by default).
- **FR-INS-04** SHOULD: dismiss an insight per user.

### 2.14 Audit (AUD)
- **FR-AUD-01** MUST: create/update/delete/restore of financial records produce an audit event with actor, timestamp and before/after snapshot.
- **FR-AUD-02** SHOULD: a member can view the change history of a transaction.

---

## 3. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 Correctness | Money is integer minor units end to end (ADR-002). Split/installment/balance invariants covered by unit + property-based tests. |
| NFR-02 Isolation | Every household-scoped query is filtered by an authorized `householdId`. Cross-household access returns 404. E2E tests for each module. |
| NFR-03 Security | argon2id password hashing, JWT access ≤15 min, rotating hashed refresh tokens, rate limiting, input whitelisting, no stack traces in production, secrets only via env (ADR-004, `SECURITY_PRIVACY.md`). |
| NFR-04 Privacy | LGPD-minded: collect minimum data; income visibility honored in every API response including analytics and audit; no financial values in logs. |
| NFR-05 Time | Date-only and instant semantics per ADR-003; month boundaries in household timezone. |
| NFR-06 Performance | p95 < 300 ms for dashboard/list endpoints with 5 years × 300 tx/month per household on a modest instance; indexes justified by query plans. |
| NFR-07 Auditability | Soft delete + audit events for financial records (ADR-008). |
| NFR-08 Explainability | Every number on dashboard/insights can be traced to transactions (drill-down). |
| NFR-09 Usability | Mobile-first, pt-BR UI, BRL formatting via `Intl`, add-expense in ≤ 30 s, WCAG 2.1 AA for core flows. |
| NFR-10 Maintainability | Modular monolith, strict TypeScript, dependency rules enforced by lint where feasible (ADR-001). |
| NFR-11 Operability | Structured JSON logs with request id, `/api/health`, migrations only, Docker Compose for local. |
| NFR-12 Concurrency | Optimistic locking (`version`) on mutable financial aggregates; conflicting edit → 409. |

---

## 4. Use cases (summary)

| UC | Name | Primary actor | Main requirements |
|---|---|---|---|
| UC-01 | Register & log in | Visitor | FR-AUTH-01..04 |
| UC-02 | Create household | User | FR-HH-01, FR-CAT-01 |
| UC-03 | Invite & accept partner | Owner / User | FR-HH-03..06 |
| UC-04 | Register income & visibility | Member | FR-INC-01..04 |
| UC-05 | Add expense with split | Member | FR-TX-01..04, FR-TX-09 |
| UC-06 | Edit / delete / restore expense | Member | FR-TX-06..08, FR-AUD-01 |
| UC-07 | Understand contribution imbalance | Member | FR-DASH-01..04 |
| UC-08 | Manage recurring cost & confirm occurrence | Member | FR-REC-01..05 |
| UC-09 | Register installment purchase & see release timeline | Member | FR-INST-01..04 |
| UC-10 | Set budget & follow consumption | Member | FR-BUD-01..04 |
| UC-11 | Track goal | Member | FR-GOAL-01..03 |
| UC-12 | Plan a purchase project | Member | FR-PP-01..04 |
| UC-13 | Monthly review (analytics + insights) | Member | FR-AN-*, FR-INS-* |
| UC-14 | Leave / remove member / transfer ownership | Owner / Member | FR-HH-08 |

### UC-05 Add expense — main flow
1. Member opens "Nova despesa" in the active household.
2. Enters amount, description, date (defaults to today in household timezone), category.
3. Payer defaults to the current member; split defaults to household default rule.
4. Optionally overrides the split (rule/participants/weights) or marks it `INDIVIDUAL` with a responsible member.
5. Optionally converts to installment purchase (→ UC-09).
6. System validates membership, category ownership, split invariants, and computes allocations.
7. System persists transaction + allocations + audit event atomically, returns allocations.

Alternate flows: `INCOME_PROPORTIONAL` with a participant lacking income at that date → error `INCOME_BASIS_MISSING` (Q-03 accepted); custom split not summing → `SPLIT_SUM_MISMATCH`; category archived → `CATEGORY_ARCHIVED`.

### UC-07 Understand imbalance — main flow
1. Member opens dashboard for a month.
2. System computes paid and responsible amounts per member from non-deleted transactions in the month.
3. System shows paid share vs responsibility share and deviation.
4. Member expands explanation; system lists top categories and transactions by signed contribution to the deviation, with evidence links.
5. Member optionally views cumulative contribution balance.

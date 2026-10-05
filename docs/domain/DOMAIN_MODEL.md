# Domain Model

Related: `BUSINESS_RULES.md`, `CALCULATIONS.md`, `docs/architecture/ERD.md`, `docs/architecture/MODULES.md`.

## 1. Ubiquitous language

| Term (EN, code) | pt-BR (UI) | Meaning |
|---|---|---|
| Household | Casa / Lar | Shared financial workspace. Tenant boundary. |
| Member | Membro | A user's membership in one household (role, status, preferences). Financial records reference **members**, not users. |
| Payer | Quem pagou | Member whose money left an external account. |
| Responsible / Allocation | Responsável / Parte | Member's economic share of a transaction. |
| Split rule | Divisão | How a transaction amount becomes allocations. |
| Shared scope | Despesa da casa | Transactions whose split type ≠ `INDIVIDUAL`. |
| Individual expense | Despesa individual | Split type `INDIVIDUAL`; one responsible member, any payer. |
| Contribution balance | Saldo de contribuição | `paid − responsible`. Neutral term; never "dívida". |
| Settlement | Acerto | Record of an out-of-app transfer between members that adjusts balances. |
| Recurring expense | Despesa recorrente | Rule that projects occurrences. |
| Occurrence | Ocorrência | One expected instance of a recurring expense; projected or confirmed. |
| Installment plan | Compra parcelada | Finite purchase split into N dated installments. |
| Release | Liberação | Monthly commitment freed when an installment plan ends. |
| Budget | Orçamento | Monthly spending limit for the household or a category. |
| Goal | Meta | Savings target tracked by bookkeeping contributions. |
| Purchase plan | Plano de compras | Project with a list of items to buy (e.g. "Casita"). |
| Insight | Insight | Deterministic, evidence-backed observation. |

## 2. Bounded contexts / modules

| Context | Modules | Owns |
|---|---|---|
| Identity & Access | `auth`, `users` | User, credentials, refresh tokens |
| Household | `households` (incl. members, invitations) | Household, HouseholdMember, HouseholdInvitation, default split rule |
| Ledger | `categories`, `transactions`, `incomes` | Category, Transaction, SplitAllocation, IncomeRecord, (Settlement) |
| Commitments | `recurring-expenses`, `installments` | RecurringExpense, InstallmentPlan |
| Planning | `budgets`, `goals`, `purchase-plans` | Budget, Goal, GoalContribution, PurchasePlan, PurchasePlanItem |
| Intelligence | `analytics`, `insights` | Read models only (no owned financial truth); InsightDismissal |
| Platform | `audit`, `common` | AuditEvent, error envelope, clock, id generation |

The original module list merged `members` into `households`: membership has no lifecycle independent of the household aggregate. See `docs/architecture/MODULES.md`.

## 3. Aggregates, entities and value objects

### Identity & Access
- **User** (aggregate root): `id`, `email` (normalized lower-case), `passwordHash`, `displayName`, timestamps, `deletedAt`.
- **RefreshToken**: `id`, `userId`, `familyId`, `tokenHash`, `expiresAt`, `revokedAt`, `replacedById`. Infrastructure-level; not a domain aggregate.

### Household
- **Household** (aggregate root): `id`, `name`, `currency` (`CurrencyCode` VO), `timezone` (`IanaTimeZone` VO), `defaultSplitRule` (`SplitRule` VO), `archivedAt`, `version`.
- **HouseholdMember** (entity inside Household): `id`, `userId`, `role` (`OWNER | MEMBER`), `status` (`ACTIVE | LEFT | REMOVED`), `incomeVisibility` (`EXACT | RATIO_ONLY`), `joinedAt`, `leftAt`.
  - Invariants: ≥1 active OWNER while any member is active; ≤ `MAX_ACTIVE_MEMBERS` (2 in MVP); one active membership per (household, user).
- **HouseholdInvitation** (entity, own lifecycle): `id`, `householdId`, `email`, `tokenHash`, `invitedByMemberId`, `status` (`PENDING | ACCEPTED | REVOKED`; `EXPIRED` derived from `expiresAt`), `expiresAt`, `acceptedByUserId`, `acceptedAt`.
  - Invariants: single use; accept only if `PENDING`, not expired, email matches accepting user, capacity available.

### Ledger
- **Category** (aggregate root): `id`, `householdId`, `parentId?` (max depth 2), `name`, `icon?`, `color?`, `isSystem`, `archivedAt`.
- **Transaction** (aggregate root): `id`, `householdId`, `description`, `amount` (`Money`), `date` (`LocalDate`), `categoryId`, `payerMemberId`, `paymentMethod`, `notes?`, `tags[]`, `split` (`SplitSnapshot` VO), `allocations` (`SplitAllocation[]`), origin (`recurringExpenseId + occurrenceDate` | `installmentPlanId + installmentNumber` | none), `createdByMemberId`, `version`, `deletedAt`, `deletedByMemberId`.
  - Invariants: `amount > 0`; `Σ allocations = amount`; allocations reference household members; category belongs to same household and is a leaf or top-level category; origin fields are all-or-nothing.
- **SplitAllocation** (entity inside Transaction): `memberId`, `amount` (`Money`), `weight` (integer; bps or 1).
- **IncomeRecord** (aggregate root): `id`, `householdId`, `memberId`, `monthlyAmount` (`Money`), `effectiveFrom` (`LocalDate`), `effectiveTo?`, `deletedAt`.
  - Invariants: periods for one member never overlap; only the owning member mutates.
- **Settlement** (Q-01 accepted, Stage 06): `id`, `householdId`, `fromMemberId` (who transferred), `toMemberId` (who received), `amount`, `date`, `notes?` (≤ 200), `createdByMemberId`, `deletedAt`. Invariants: members differ, amount > 0; no edit (BUSINESS_RULES 30).

### Commitments
- **RecurringExpense** (aggregate root): template fields (description, category, `expectedAmount`, `amountType FIXED|VARIABLE`, payer, `SplitRule`, payment method) + `RecurrenceRule` VO (`frequency WEEKLY|MONTHLY|YEARLY`, `interval`, `dayOfMonth?`, `startDate`, `endDate?`) + `status ACTIVE|PAUSED|ENDED`, `version`.
  - Occurrences are not entities until confirmed; a confirmed occurrence **is** a Transaction with origin `(recurringExpenseId, occurrenceDate)`.
  - Stage 07: the day of month (or weekday) comes from `startDate`; `status` is derived (`PAUSED` while a pause window is open, `ENDED` after `endDate`); pauses are stored as windows `[from, to)`; a **skip** (`recurring_occurrence_skips`) marks an occurrence a member chose not to record. Split rule null = household default at confirmation.
- **InstallmentPlan** (aggregate root): `id`, description, category, `totalAmount`, `installmentCount`, `firstInstallmentDate`, payer, `SplitRule`, payment method, `status ACTIVE|CANCELLED|COMPLETED (derived)`. Its installments **are** Transactions with origin `(installmentPlanId, installmentNumber, installmentCount, payoff)`, created eagerly (bounded ≤ 72). Stage 07: stores `originalTotalCents`, the resolved `splitSnapshot`, and `closeKind CANCEL|PAY_OFF` + `closedAt`; status is derived.

### Planning
- **Budget** (aggregate root): `id`, `householdId`, `categoryId?` (null = household total), `amount`, `effectiveFromMonth` (`YearMonth`), `effectiveToMonth?`.
  - Invariant: for a (household, category) no two budgets overlap in months.
  - Stage 08 (ADR-014): stored as periods `[fromMonth, untilMonth)` per line; changes apply from a month on; no rollover; shared scope only.
- **Goal** (aggregate root): `id`, name, `targetAmount`, `targetDate?`, `participantMemberIds[]`, `status ACTIVE|ACHIEVED|ARCHIVED`.
- **GoalContribution** (entity inside Goal): `memberId`, `type CONTRIBUTION|WITHDRAWAL`, `amount > 0`, `date`, notes, `deletedAt`.
- **PurchasePlan** (aggregate root): `id`, name, description, `goalId?`, `status ACTIVE|COMPLETED|ARCHIVED`.
- Stage 09 (ADR-015): goal and plan statuses are derived; goals/plans are archived (not deleted); goal entries are soft-deleted; items are soft-deleted and carry `version`.
- **PurchasePlanItem** (entity inside PurchasePlan): name, `estimatedPrice`, `quantity ≥ 1`, `paidPrice?`, `priority LOW|MEDIUM|HIGH`, `status PENDING|PURCHASED|FUTURE`, `responsibleMemberId?`, `url?`, `notes?`, `transactionId?`, `purchasedAt?`.

### Intelligence
- **Analytics read models**: computed per request (ADR-009). No persistence.
- **Insight** (value, not persisted): `ruleId` (+ `direction` for month changes; together the message key), `ruleVersion`, `severity INFO|ATTENTION`, `month`, `thresholds`, typed `metrics` (the message params), subject (category, budget, plan or member), `evidence`, `fingerprint` (ADR-017).
- **InsightDismissal** (persisted): `householdId`, `userId`, `fingerprint`, `dismissedAt` (app clock). Per user and month; not audited (viewing preference).

### Platform
- **AuditEvent**: `id`, `householdId?`, `actorUserId`, `entityType`, `entityId`, `action CREATE|UPDATE|DELETE|RESTORE|RECALCULATE`, `before?`, `after?`, `occurredAt`, `requestId`.

## 4. Value objects

| VO | Representation | Rules |
|---|---|---|
| `Money` | integer cents (`number`, safe integer) + household currency implicit | `Number.isSafeInteger`; arithmetic only via domain helpers; `BigInt` for products (ADR-002) |
| `CurrencyCode` | ISO 4217 string | MVP allow-list: `BRL`, `USD`, `EUR` (2 minor units) |
| `LocalDate` | `YYYY-MM-DD` | calendar date without time zone (ADR-003) |
| `YearMonth` | `YYYY-MM` | budgets and monthly analytics |
| `IanaTimeZone` | e.g. `America/Sao_Paulo` | validated against `Intl.supportedValuesOf('timeZone')` |
| `BasisPoints` | integer 0..10000 | percentages without floats |
| `SplitRule` | `{ type, participants?, weights? }` | household default / recurring / installment template |
| `SplitSnapshot` | `{ type, weights[] (bps or 1), source: DEFAULT|OVERRIDE, incomeBasisDate? }` | stored per transaction, never contains raw income |
| `RecurrenceRule` | see above | bounded projections |

## 5. Key relationships
- A User has 0..n HouseholdMembers (one per household). Financial records reference `HouseholdMember.id`, so a person's history survives leaving.
- A Transaction belongs to one Household, has exactly one payer member and 1..n allocations summing to its amount.
- An IncomeRecord belongs to one member; proportional splits read the record effective on the transaction date and snapshot only bps.
- Budgets, Goals, PurchasePlans, RecurringExpenses and InstallmentPlans belong to one Household.
- A PurchasePlanItem may reference the Transaction that paid it; a PurchasePlan may reference a Goal.

## 6. Cross-module references
Modules reference other modules' aggregates **by id only**. Validation of a foreign id (e.g. category belongs to household) goes through the owning module's public service. See `DEPENDENCY_RULES.md`.

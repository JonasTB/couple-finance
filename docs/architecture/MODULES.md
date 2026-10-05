# Modules & Boundaries

Implements `TECHNICAL_ARCHITECTURE.md` and `DEPENDENCY_RULES.md`.

## 1. Backend module map (`apps/api/src/modules`)

| Module | Context | Layers | Public API (exported Nest provider) | Depends on |
|---|---|---|---|---|
| `common` | Platform | flat | error envelope, `Clock`, `IdGenerator`, `Money` helpers, pagination | — |
| `audit` | Platform | flat | `AuditRecorder.record(event, tx)` | common |
| `auth` | Identity | application/infrastructure/presentation | guards, `CurrentUser` decorator | users, common |
| `users` | Identity | flat | `UsersService` (find/create) | common |
| `households` | Household | domain/application/infrastructure/presentation | `HouseholdAccess.requireMember(userId, householdId, permission)`, `MembersQuery` (stable member order, active members) | users, audit, common |
| `categories` | Ledger | flat | `CategoriesQuery.assertUsable(householdId, categoryId)`, subtree lookup | households |
| `incomes` | Ledger | domain/application/infrastructure/presentation | `IncomeBasis.bpsFor(householdId, memberIds, date)` (returns bps only); `HouseholdIncome.totalsOn` (Stage 10: household income per date for analytics; returns amounts, so the caller applies visibility) | households, audit |
| `transactions` | Ledger | domain/application/infrastructure/presentation | `TransactionWriter` (Stage 07: `create`/`setDeleted` inside the caller's DB transaction, `resolveSnapshot`, `assertSplitRule`), `LedgerQuery` (month entries, settlement and cumulative flows, installments and confirmations by origin, monthly spend/responsibility aggregates and the first expense date for analytics; excludes soft-deleted rows), `SplitInputDto` (request shape) | households, categories, incomes, audit, users |
| `recurring-expenses` | Commitments | domain/application/infrastructure/presentation | none yet (Stage 07 serves occurrences through its own API; `CommitmentsQuery` comes with analytics) | transactions, categories, households, audit |
| `installments` | Commitments | domain/application/infrastructure/presentation | `InstallmentPlansService.summary` (Stage 11: release timeline for insights) | transactions, categories, households, audit |
| `budgets` | Planning | domain/application/infrastructure/presentation | `BudgetsService.month` (Stage 11: budget status for insights) | categories, transactions (LedgerQuery), households, audit |
| `goals` | Planning | domain/application/infrastructure/presentation | `GoalsService.summaries` (Stage 09; name and saved amount for purchase plans), `GoalsService.evolution` (Stage 10; saved at each month end) | households, audit |
| `purchase-plans` | Planning | domain/application/infrastructure/presentation | — (reads `GoalsService.summaries` and `LedgerQuery.summaries`; FK to `transactions` via `transactions/persistence.ts`) | goals, transactions, households, audit |
| `analytics` | Intelligence | domain/application/presentation | `AnalyticsQuery` (typed read models). Stage 06: `DashboardService` + pure `computeContribution`; Stage 10: `AnalyticsService` + pure `computeTrends` (ADR-016); both services exported for insights (Stage 11) | transactions, categories, households, incomes, goals (Stage 10); insights may add budgets, installments |
| `insights` | Intelligence | domain/application/infrastructure/presentation | — (Stage 11: `InsightsService`, pure `evaluateInsights`, `insight_dismissals`; ADR-017) | analytics, budgets, installments, households, users (FK only) |
| `health` | Platform | flat | — | — |

`members` from the original list is folded into `households` (membership is part of the Household aggregate).

**Enforcement (Stage 04).** Each module exposes `public.ts` (services, guards, contract types) and, when other modules need ORM relations, `persistence.ts` (entities; importable only from `infrastructure/` or `*.entity.ts`). The local ESLint rule `local/module-boundaries` (`packages/eslint-config/rules/module-boundaries.js`, tested with RuleTester) enforces entry points and the allowed dependency map, which lives in `apps/api/eslint.config.mjs` and must be kept in sync with the table above. A second rule forbids framework/infrastructure imports in `*/domain/**`.

Platform helpers in `src/common`: `events/` (`DomainEvents`, ADR-013), `money/` (cents helpers, largest-remainder allocation), `validation/` (`@IsLocalDate`, `UuidParamPipe`, transforms), `database/` (`UnitOfWork` + opaque `TransactionContext`), `crypto/` (opaque tokens), `rate-limit/` (throttlers), `auth/` (`@Public`, `@CurrentUser`, `@CurrentActor`). `common` never imports feature modules. `settlements` (Q-01 accepted) lives inside `transactions` as a ledger entry type (Stage 06: own table, repository, service and controller in that module).

## 2. Allowed dependency direction

```
Platform (common, audit)
   ↑
Identity (users, auth)
   ↑
Household (households)
   ↑
Ledger (categories → incomes → transactions)
   ↑
Commitments (recurring-expenses, installments)    Planning (budgets, goals, purchase-plans)
   ↑                                                 ↑
                    Intelligence (analytics → insights)
```
- Arrows point to what a module may depend on. No upward or cyclic dependencies.
- A module imports only another module's **exported** providers and contract types (`<module>/public.ts` barrel). Lint rule (`eslint-plugin-boundaries` or `import/no-restricted-paths`) enforces this from Stage 02.

## 3. Layering inside complex modules

```
presentation  (controllers, DTOs, Swagger)        → application
application   (use cases, ports, transactions)    → domain
domain        (entities, VOs, policies; pure TS)  → nothing framework-specific
infrastructure(TypeORM entities/repositories)     → implements application/domain ports
```
TypeORM entity classes are infrastructure. Domain objects are plain TypeScript; mappers convert. For trivial modules (`users`, `categories`, `health`), a flat service + repository is accepted.

## 4. Unit of work
Use cases that write financial data run inside one database transaction that also writes the `AuditEvent` (ADR-008). Implemented with a small `UnitOfWork` port over TypeORM `DataSource.transaction`; no ambient magic (no CLS) unless justified later.

## 5. Web app structure (`apps/web/src`)

```
app/          router, providers (QueryClient, auth), layout
features/     auth, household, transactions, dashboard, commitments, budgets, goals, purchase-plans, analytics, insights
  <feature>/  api.ts (TanStack Query hooks), components/, routes/, schemas.ts (Zod)
shared/       ui (shadcn), lib (formatMoney, dates), api client
```
React components never perform financial arithmetic beyond display formatting; forms convert user input "1.234,56" → cents with a single tested parser in `shared/lib/money.ts`.

## 6. `packages/shared`
Kept small: API contract types (request/response DTO interfaces), enums (split types, payment methods, roles, error codes), and pure formatting/parsing helpers. **No** TypeORM entities, Nest decorators, or business calculations. Duplication is preferred over coupling.

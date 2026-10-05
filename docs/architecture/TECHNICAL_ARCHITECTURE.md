# Technical Architecture

## Style
Start as a modular monolith. Use pragmatic DDD and Clean/Hexagonal dependency direction where business complexity warrants it.

## Monorepo
Proposed:
- `apps/api`: NestJS API
- `apps/web`: React/Vite SPA
- `packages/shared`: deliberately small cross-app contracts/utilities; do not leak backend domain entities
- `packages/eslint-config`
- `packages/tsconfig`

## Backend modules
`auth`, `users`, `households` (includes members and invitations — see `MODULES.md`), `categories`, `transactions`, `incomes`, `recurring-expenses`, `installments`, `budgets`, `goals`, `purchase-plans`, `analytics`, `insights`.

Organize by feature. Within complex modules, layers may be `domain`, `application`, `infrastructure`, `presentation`. Do not force layers into trivial modules.

## API
REST JSON initially. Swagger at `/api/docs`. Consistent error envelope with machine code. Versioning: URL prefix `/api/v1` (ADR-010). Details in `API_CONVENTIONS.md`.

## Persistence
PostgreSQL + TypeORM migrations. `synchronize: true` prohibited for production. Add indexes from observed/query requirements, not guesswork alone.

## Web
React Router for navigation, TanStack Query for server state, React Hook Form + Zod for forms, Tailwind + shadcn/ui for UI, Recharts for meaningful charts. Mobile-first.

## Security
Password hashing, short-lived access JWT, secure refresh-token design, server-side authorization, rate limiting on sensitive endpoints, env secrets, validation/whitelisting, safe error responses, logging redaction. Threat model auth/invitations/household isolation.

## Observability
Structured logs with request/correlation ID. No sensitive finance data in logs unless explicitly safe. Health endpoint. Keep provider-neutral initially.

## Testing
Unit test domain rules; integration test repositories/DB boundaries; e2e critical auth/authorization and financial flows. Frontend tests target critical behavior, not vanity coverage.

## LLM boundary
No LLM in MVP. Future Copilot consumes backend-generated structured facts. It cannot calculate balances, splits or projections independently.

## Stage 01 decision index
- Modules and boundaries: `MODULES.md` (ADR-001)
- ERD and constraints: `ERD.md` (ADR-011 for ids)
- API conventions: `API_CONVENTIONS.md` (ADR-010)
- Security, privacy and threat model: `SECURITY_PRIVACY.md` (ADR-004, ADR-005)
- Money, dates: ADR-002, ADR-003
- Splits, recurrences, installments: ADR-006, ADR-007, `docs/domain/CALCULATIONS.md`
- Audit and analytics: ADR-008, ADR-009

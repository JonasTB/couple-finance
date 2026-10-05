# Couple Finance

Shared financial workspace for couples: where household money goes, who paid, who was responsible for each cost, and how to plan together, without holding anyone's money. The interface is in Brazilian Portuguese; amounts are handled as integer cents end to end.

## Features
- **Households and invitations**: a couple shares one workspace. Invitations travel as a link with a single-use token, and roles are owner and member.
- **Expenses**:
  - who paid vs who is responsible;
  - splits: equal, proportional to income, custom percentages or amounts, individual;
  - categories, search and filters;
  - change history and soft delete with undo.
- **Income** with per-person visibility (exact amount or ratio only).
- **Monthly overview**:
  - paid vs planned share per person, with the categories and expenses that explain the difference;
  - the balance of contributions, cumulative too;
  - settlements ("acertos").
- **Commitments**: recurring expenses (confirm, skip, pause, end) and installment plans with the release timeline.
- **Budgets** for the household total and per category, with warnings at 80% and 100%.
- **Goals** with contributions, withdrawals and a forecast. **Purchase plans** with items, the actual price paid, and the link to a goal.
- **Analytics**:
  - monthly trend, split into fixed (recurring + installments) and variable;
  - share of household income committed;
  - who paid month by month;
  - categories against their average;
  - goal evolution.
- **Insights**: deterministic rules (category above or below average, budget at risk, installments ending, contribution gap, dominant category, month-over-month change), each showing its evidence and rule. Each person can dismiss them.

## Stack
| Part | Technology |
|---|---|
| Monorepo | pnpm workspaces, TypeScript strict |
| API | NestJS 11, TypeORM, PostgreSQL 17, class-validator, Swagger, Jest |
| Web | React 19, Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind CSS, Recharts, Vitest |
| Infra | Docker Compose (local), Vercel + Neon (production), GitHub Actions (CI) |

## Requirements
- Node.js 24 (`.nvmrc`)
- pnpm 10 (`corepack enable`, or `npm i -g pnpm@10`)
- Docker with Compose (PostgreSQL 17)

## Getting started
```bash
cp .env.example .env          # local placeholders only; never commit .env
pnpm install
pnpm db:up                    # starts PostgreSQL and waits until healthy
pnpm db:migrate               # applies the migrations to the dev database
```

Run the API and the web app in two terminals:
```bash
pnpm dev:api                  # http://localhost:3000  (Swagger: /api/docs)
pnpm dev:web                  # http://localhost:5173  (proxies /api to the API)
```
Open http://localhost:5173 and create an account, or load the demo data below. The `dev:*` scripts build `@couple-finance/shared` first.

### Demo data
```bash
pnpm db:seed:demo                       # couple "Ana & Bruno" with the last 12 months of data
pnpm db:seed:demo -- --reset            # recreate it
pnpm db:seed:demo -- --profile=volume --reset   # 5 years × ~300 expenses/month (performance checks)
pnpm db:seed:demo -- --profile=volume --delete  # remove the volume data
```
Sign in as `demo.ana@example.com` or `demo.bruno@example.com`. The local-only password is `DEFAULT_PASSWORD` in [`apps/api/scripts/seed-demo.ts`](apps/api/scripts/seed-demo.ts); set `DEMO_PASSWORD` to use another one. The seed goes through the public API, so every domain rule applies, and it refuses to run in production.

## Everyday commands
| Command | What it does |
|---|---|
| `pnpm verify` | format check, lint, typecheck, unit tests, production build (all packages) |
| `pnpm test:e2e` | API end-to-end tests against the `couple_finance_test` database (needs `pnpm db:up`); `E2E_LOG_LEVEL=error pnpm test:e2e` shows server errors |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | individual gates |
| `pnpm format` | apply Prettier |
| `pnpm db:down` | stop PostgreSQL (data kept in the `postgres-data` volume) |

### Migrations
```bash
pnpm --filter @couple-finance/api migration:show
pnpm --filter @couple-finance/api migration:run
pnpm --filter @couple-finance/api migration:revert
pnpm --filter @couple-finance/api migration:generate src/database/migrations/<Name>
pnpm --filter @couple-finance/api migration:check   # fails if entities and migrations differ
```
`synchronize` is always off; every schema change is a reviewed migration.

## Project layout
```
apps/api                NestJS API (modular monolith): src/common, src/config, src/database, src/modules/*
apps/api/scripts        demo seed and deploy-time migrations
apps/web                React + Vite SPA: src/app, src/features/*, src/shared
packages/shared         API contracts shared by api and web (types, error codes); no business logic
packages/tsconfig       shared TypeScript presets
packages/eslint-config  shared ESLint flat configs and the module-boundaries rule
infra/postgres          database init scripts (creates the test database)
docs                    product, domain, architecture, decisions, deployment and roadmap
vercel.json             Vercel Services: web + api on one domain
.github/workflows       CI
```

## Documentation
| Topic | Where |
|---|---|
| Product: vision, requirements, user journeys | [`docs/product`](docs/product) |
| Domain: model, business rules, calculations (allocation, balances, analytics, insights) | [`docs/domain`](docs/domain) |
| Architecture: modules, ERD, API conventions, security and privacy, performance | [`docs/architecture`](docs/architecture) |
| Architecture decision records | [`docs/decisions`](docs/decisions/README.md) |
| Deployment (Vercel + Neon) | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Known limitations and roadmap | [`docs/ROADMAP.md`](docs/ROADMAP.md) |

## API conventions (summary)
- Routes under `/api/v1`; `/api/health` is unversioned.
- Money as integer cents (`*Cents`), shares as basis points (`*Bps`), dates as `YYYY-MM-DD`, instants in ISO-8601 UTC.
- Errors: `{ "error": { "code", "message", "details?", "requestId" } }`; every response carries `x-request-id`.
- Auth (ADR-004):
  - every route needs `Authorization: Bearer <accessToken>` unless public;
  - `/api/v1/auth/*` endpoints require `X-Requested-With: couple-finance` and manage the httpOnly `cf_refresh` cookie.

Details: [`docs/architecture/API_CONVENTIONS.md`](docs/architecture/API_CONVENTIONS.md).

## Deployment and CI
- **Production**: one Vercel project with two Services, `web` and `api`, on the same domain, plus Neon PostgreSQL. Migrations run during the API build. Step-by-step guide: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md); architecture: [ADR-018](docs/decisions/ADR-018-deployment-vercel-neon.md).
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): on pull requests and on `main`, it runs `pnpm verify`, `pnpm audit --prod`, migrations from scratch with a drift check, and the end-to-end suite on PostgreSQL 17.

## Environment variables
See [`.env.example`](.env.example). The API validates its environment at startup and refuses to boot with invalid values.
- `DATABASE_URL_TEST` is used only by the e2e suite.
- Rate limits: `AUTH_RATE_LIMIT_PER_MINUTE` and `LOGIN_RATE_LIMIT_PER_EMAIL` for authentication; `API_RATE_LIMIT_PER_MINUTE` for every other endpoint, per user.
- Production-only settings are listed in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

# CLAUDE.md — Couple Finance

Shared financial workspace for couples: who paid, who was responsible, recurring costs, installments, budgets, goals, analytics and explainable insights. It is **not** a bank, wallet or payment initiator; money stays in each person's institutions. Setup and commands: `README.md`. Documentation map: `docs/`.

## Domain invariants (never break)
- Who **paid** is not who is **economically responsible**; both are stored.
- Money is integer cents end to end; shares are basis points (`10000` = 100%). No binary floating point for money (ADR-002).
- A split always reconciles exactly to the expense amount (largest remainder, `docs/domain/CALCULATIONS.md` §1).
- Financial calculations live in deterministic backend domain code (`apps/api/src/modules/*/domain`), never in components, controllers or an LLM.
- Every household route validates membership server-side; another household's data is a 404.
- History is not silently rewritten: soft delete, audit events, optimistic `version`; income and split bases are effective-dated.
- Income visibility is honored in every response (`RATIO_ONLY` hides amounts, ADR-005).
- Recurrences and installments never create unbounded records.
- Dates are `YYYY-MM-DD` with the household time zone for "today" (ADR-003).
- Insights are deterministic and traceable to data; copy is neutral (no blame, no "deve", no ranking partners).

## Engineering rules
- Modular monolith: modules talk only through `public.ts`/`persistence.ts`, enforced by ESLint `local/module-boundaries` (map in `apps/api/eslint.config.mjs`, documented in `docs/architecture/MODULES.md`).
- TypeScript strict; no `any` without a written reason; no unrelated refactors.
- Schema changes only through TypeORM migrations (`synchronize` is always off); `pnpm --filter @couple-finance/api migration:check` must report no drift. Deploy-time migrations must stay backward compatible (expand → deploy → contract).
- Tests focus on invariants and failure cases (property tests for money and allocation).
- No secrets in git; configuration is validated at startup (`apps/api/src/config/env.ts`).

## Before finishing a change
Run `pnpm verify` (format, lint, typecheck, unit tests, build) and, with the database up, `pnpm test:e2e`. Record architecture, product or domain decisions in `docs/` (new ADRs in `docs/decisions`, rules in `docs/domain/BUSINESS_RULES.md`) and keep `docs/ROADMAP.md` current. Ask before resolving a material product ambiguity.

# ADR-001 — Modular monolith in a pnpm monorepo

Status: Accepted (Stage 01, 2026-10-04)

## Context
One small team and one product with a handful of bounded contexts. They share a single database and a single transactional consistency need: a transaction, its allocations and its audit event must be written together. There is one web client.

## Decision
- One NestJS API (`apps/api`) organized as a **modular monolith** by feature (`docs/architecture/MODULES.md`). Module boundaries are enforced by a public-barrel convention plus an ESLint boundaries rule.
- One React SPA (`apps/web`).
- **pnpm workspaces without Turborepo** at first. Root scripts run `pnpm -r` / `--filter`. Add Turborepo only if CI time becomes a measured problem (new ADR).
- Shared packages: `packages/shared` (contracts/enums/formatters only), `packages/tsconfig`, `packages/eslint-config`.
- Single PostgreSQL database and schema; tables are owned by modules (documented in ERD); no cross-module foreign-key writes outside the owner's services.

## Consequences
+ Simple deploy, ACID transactions across modules, low ops cost.
+ Boundaries can be extracted later if needed.
− Discipline is needed to keep boundaries; lint rules and code review carry that load.

## Alternatives
- Microservices / event-driven: rejected; no scaling or team-topology driver (CLAUDE.md forbids without approval).
- Nx: more powerful, but heavier than needed now.

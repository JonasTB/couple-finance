# ADR-012 — Toolchain versions for the MVP

Status: Accepted (Stage 02, 2026-10-04) — technical decision taken during bootstrap; open to review.

## Context
At bootstrap time (2026-10-04) the newest majors were NestJS 12 (ESM-only, released 2026-08), TypeORM 1.x (requires Node ≥ 24.11), TypeScript 7 (native compiler) and ESLint 10. The stack mandates Jest for the API. Checked constraints:
- NestJS 12 is `"type": "module"`; Jest runs ESM only in experimental mode.
- TypeScript 7 is outside the supported range of typescript-eslint (`<6.1`), ts-jest (`<7`) and @nestjs/swagger 12 (`^5.5 || ^6`).
- TypeORM 1.x engines exclude the local Node 24.4.

## Decision
| Area | Version line | Reason |
|---|---|---|
| Node | 24 LTS (`.nvmrc`, `engines >=24`) | Current LTS; `process.loadEnvFile`, `require(esm)` |
| pnpm | 10 | Workspaces (ADR-001) |
| TypeScript | 5.9 (single version in all packages) | Supported by every tool in the chain |
| NestJS | 11.2.x (CommonJS) + @nestjs/swagger 11, @nestjs/typeorm 11, @nestjs/config 4 | Mature CJS line, still patched (11.2.7, 2026-09-30); first-class Jest support |
| TypeORM | 0.3.x + pg 8 | Works on all Node 24 minors; migrations CLI via `typeorm-ts-node-commonjs` |
| Testing (API) | Jest 30 + ts-jest, supertest, fast-check | Stack requirement; property tests for money/date invariants |
| Logging | nestjs-pino 5 / pino 10 | Structured JSON, request id, redaction |
| Config validation | zod 4 (env only) | One schema with coercion and readable errors; DTOs still use class-validator |
| Web | Vite 8, React 19, React Router 8, TanStack Query 5, Tailwind CSS 4, shadcn/ui conventions | Current stable lines |
| Testing (web) | Vitest 5 + Testing Library + jsdom | Native to Vite |
| Lint/format | ESLint 10 flat config + typescript-eslint 8 (`strictTypeChecked`), Prettier 3 | Type-aware rules caught two real bugs during bootstrap |

Dependencies listed in the stack but not used yet (React Hook Form, Zod in web, Recharts) are added in the stage that first needs them.

## Upgrade path
Move to NestJS 12 + TypeORM 1.x + TypeScript 6/7 together in a dedicated change once Jest ESM support or a test-runner change (new ADR) is accepted and the tooling peers support it. Domain code is framework-free, so the impact is limited to infrastructure/presentation.

## Amendment to ADR-003
Date-only arithmetic is implemented with small native helpers (`apps/api/src/common/time/local-date.ts`, property-tested) instead of `date-fns`, because calendar dates are never converted through `Date`. A date library may still be added for display formatting in the web app.

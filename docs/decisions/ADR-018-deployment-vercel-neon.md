# ADR-018 — Deployment on Vercel (Services) with Neon PostgreSQL

Status: Accepted (Stage 13, 2026-10-05). Input: user decision on 2026-10-05 to deploy on Vercel, with the database on Vercel's Marketplace (Neon).

## Context
The MVP is a Vite SPA, a NestJS API and PostgreSQL. The API was built as a long-running server. On Vercel it runs as a function, which raises three questions:
- **Same-origin cookies.** The refresh cookie is `SameSite=Strict` on `/api/v1/auth`, and `*.vercel.app` hosts are separate sites, so the web and the API must share one origin.
- **The client IP for per-IP limits.** Vercel overwrites `X-Forwarded-For` and does not forward external IPs. An API reached through another project's rewrite could therefore see Vercel's proxy instead of the user, and one login limit would apply to everybody.
- **Connections and migrations** on serverless instances.

## Decision

### Topology: one Vercel project, two Services
- Root `vercel.json` defines two services:
  - `web`: Vite, `apps/web`, static;
  - `api`: NestJS, `apps/api`, one Vercel Function on Fluid compute.
- Top-level rewrites: `/api/(.*)` → `api`, everything else → `web`. One domain, so cookies stay first-party.
- Requests enter each service directly from Vercel's edge, so `X-Forwarded-For` is the real client. The API path is preserved (`/api/v1/...`), matching Nest's global prefix.
- Vercel Services are in **beta** (all plans). If they change or fail, the fallback is two projects plus a custom domain with `app.` and `api.` subdomains (same site). That fallback needs CORS for the web origin and a review of the per-IP limits.

### Builds
- `web`: `pnpm --filter @couple-finance/shared build && pnpm run build` → `dist`. SPA fallback to `index.html` after the filesystem.
- `api`: `pnpm run vercel-build` = build `shared`, `nest build`, then `scripts/migrate-on-deploy.ts`. Vercel's NestJS preset packages `src/main.ts` (about 18 MB; limit 250 MB). Verified locally with `vercel build` (CLI 62.2.0).
- `@couple-finance/shared` is compiled by each service, because services may build in isolation.
- No Dockerfile. Vercel builds from source; `runtime: "container"` is the documented fallback if the function packaging ever becomes a problem.

### Database: Neon through the Vercel Marketplace
- `DATABASE_URL` (pooled, PgBouncer) is used by the app, with `DATABASE_POOL_MAX` (3–5 recommended on Vercel) and a 10 s idle timeout.
- `DATABASE_URL_UNPOOLED` (direct) is used by migrations (`data-source.ts` prefers it).
- **No connection startup `options`** (poolers reject them). Migration `SetDatabaseTimeZoneUtc` sets UTC on the database itself. No query depends on the session time zone.

### Migrations at deploy time
- `RUN_MIGRATIONS_ON_BUILD=true` per environment:
  - Production: always.
  - Preview: only with Neon's per-preview database branches. Never point a preview build at the production database with migrations on.
- They run **after** the API compiled and **before** the new deployment is promoted. A failure fails the build, and the previous deployment keeps serving.
- Consequence: migrations must stay backward compatible with the running version (expand → deploy → contract). Instant Rollback rolls back code, not schema.

### Runtime configuration
- `NODE_ENV` is **not** set in Vercel: setting it to `production` would make the build skip devDependencies. The API treats `VERCEL=1` (system variable) as production unless `NODE_ENV` says otherwise. This gives `Secure` cookies, Swagger off, and the placeholder-secret guard.
- `TRUST_PROXY=true` on Vercel, so `req.ip` is the client from `X-Forwarded-For`.
- **Rate limits**: optional shared counters in Upstash Redis through its REST API (`RedisThrottlerStorage`, fixed window, fail-open), from the Marketplace variables `KV_REST_API_URL`/`KV_REST_API_TOKEN`. Without them, counters are per function instance, which is weaker but acceptable for a private MVP.
  - The general `api` budget is now one per user across all endpoints. Before, it was keyed per route handler (ADR-004 amendment 10).
- **Security headers for the web** (service `headers`):
  - a strict CSP: `script-src 'self'`; `style-src 'self'` works because React applies styles through the CSSOM, verified with zero violations on 11 screens including the charts;
  - `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS;
  - immutable caching for `/assets/*`.
- The API keeps Helmet's headers. **Swagger stays disabled in production** (API_CONVENTIONS §1).

### CI
GitHub Actions `.github/workflows/ci.yml`. Vercel deploys from Git on its own; branch protection on `main` with these checks keeps production green.
- `pnpm verify`, then `pnpm audit --prod --audit-level=moderate`.
- PostgreSQL 17 service: migrations from scratch, `migration:check`, revert and re-apply of the latest migration, then the e2e suite.

## Consequences
+ One domain, real client IPs, previews per branch (optionally with their own database), no servers to run.
+ The free tiers cover a couple-scale MVP. Vercel Hobby is for non-commercial use; commercial use needs Pro.
− Vercel Services are beta.
− Serverless cold starts (Nest + TypeORM) add latency to the first request after idle.
− In-memory rate limits are per instance unless Redis is added.
− Migrations must be written expand/contract.

# Deployment guide — Vercel + Neon

Architecture and trade-offs: [ADR-018](decisions/ADR-018-deployment-vercel-neon.md).

The deployment is **one Vercel project** with two Services (`web`, `api`) on one domain, plus a **Neon** PostgreSQL database from the Vercel Marketplace and, optionally, **Upstash Redis** for shared rate-limit counters. Nothing here is provisioned automatically: you create the accounts and resources in the dashboards below.

## 0. Before you start
- The code must be in a Git repository on GitHub (or GitLab/Bitbucket). This project is not a Git repository yet. Commit it and push it to a **private** repository; `.env` is already ignored.
- CI (`.github/workflows/ci.yml`) runs on every pull request and on `main`. In GitHub → Settings → Branches, protect `main` and require the **CI** checks, so only green commits reach production (Vercel deploys `main` automatically).
- A Vercel account (Hobby is free for personal, non-commercial use; commercial use needs Pro).

## 1. Create the Vercel project
1. Vercel → **Add New… → Project** → import the repository.
2. **Root Directory**: the repository root (leave it empty). Vercel reads `vercel.json`, which declares the `web` and `api` services. Do not set a framework, build command or output directory at the project level: they live in each service.
3. **Node.js version**: 24.x (Project → Settings → Build and Deployment).
4. Do not deploy yet: create the database and variables first (the first build would fail without `DATABASE_URL`).

## 2. Add the database (Neon)
1. Project → **Storage → Create Database → Neon** (Marketplace). Pick a region close to your users and to the Vercel function region (e.g. São Paulo `gru1` / AWS `sa-east-1`, if available).
2. Connect it to the project for **Production** and **Preview**. Neon injects `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct) and `PG*` variables.
3. Recommended: enable **a database branch per preview deployment** in the Neon integration settings. Each preview then gets its own copy of the database, and migrations can run there safely.

## 3. Environment variables
Project → Settings → **Environment Variables**. Do **not** set `NODE_ENV`: Vercel builds would then skip devDependencies. On Vercel the API runs as production automatically (`VERCEL=1`).

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | a new random value | a **different** random value | ≥ 32 chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `TRUST_PROXY` | `true` | `true` | real client IP for per-IP limits |
| `DATABASE_POOL_MAX` | `5` | `3` | connections per function instance |
| `RUN_MIGRATIONS_ON_BUILD` | `true` | `true` **only** with Neon preview branches, else `false` | never migrate the production database from a preview |
| `CORS_ORIGINS` | `https://<your-domain>` | `https://<your-domain>` | same-origin in this setup; keep it set to your real origin |
| `LOG_LEVEL` | `info` | `info` | optional |
| `API_RATE_LIMIT_PER_MINUTE`, `AUTH_RATE_LIMIT_PER_MINUTE`, `LOGIN_RATE_LIMIT_PER_EMAIL` | defaults (300 / 20 / 10) | defaults | optional |

`DATABASE_URL` and `DATABASE_URL_UNPOOLED` come from Neon (step 2).

## 4. Optional: shared rate-limit counters (Upstash Redis)
Without Redis, rate-limit counters live in each function instance, which is enough for a private MVP. For a public launch:
1. Project → **Storage → Upstash (Redis)** from the Marketplace → connect to Production (and Preview if you like).
2. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the API uses them automatically. You can also set `RATE_LIMIT_REDIS_REST_URL`/`RATE_LIMIT_REDIS_REST_TOKEN` explicitly.
3. Redeploy. If Redis becomes unreachable, the API allows the request and logs a warning (fail-open).

## 5. First deployment
1. Deploy (push to `main`, or **Deployments → Redeploy**).
2. In the build logs:
   - `[vc:service:web]` builds `shared` and the web;
   - `[vc:service:api]` runs `vercel-build`, which builds `shared` and the API, then prints `[migrate-on-deploy] Running migrations on <host>…` and `Migrations applied.`
3. Check:
   - `https://<deployment>/api/health` → `{"status":"ok","checks":{"database":"up"}}`;
   - open the site, create an account, create a household, and confirm the session survives a reload (refresh cookie, `Secure` on HTTPS).
4. Swagger (`/api/docs`) is disabled in production by design.

## 6. Day-to-day
- **Previews**: every pull request gets a preview URL. With Neon branching, it also gets its own database, migrated during the build.
- **Migrations** run in the production build, **before** the new version takes traffic, while the previous version still serves. Write them backward compatible: add first, deploy, remove later (expand/contract).
- **Rollback**: Vercel **Instant Rollback** restores the previous code, not the schema. That is safe only because migrations are backward compatible. Never edit a migration that already ran; add a new one.
- **Custom domain**: Project → Settings → Domains. Update `CORS_ORIGINS` accordingly.
- **Logs**: Project → Logs (JSON from pino; request URLs without query strings, credentials and DB values redacted).
- **Demo data** is local only: `pnpm db:seed:demo` refuses production, and you should not point it at Neon.

## 7. Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| Build fails: `Cannot find module '@couple-finance/shared'` | a service did not build `shared` first; keep the `buildCommand`s from `vercel.json` |
| Build fails at `migrate-on-deploy` | migration error: the previous deployment keeps serving; fix the migration and redeploy. Check `DATABASE_URL_UNPOOLED` exists for that environment |
| Build fails because `nest`/`vite` are missing | `NODE_ENV=production` was set in Vercel: remove it |
| Everyone gets `RATE_LIMITED` on login | `TRUST_PROXY` not `true`, so all requests look like one IP |
| Session lost on reload | not served over HTTPS, or the site is reached on a different origin than `/api` (the Services rewrite keeps them together) |
| `too many connections` / timeouts | use Neon's pooled `DATABASE_URL` for the app and keep `DATABASE_POOL_MAX` small |
| First request after idle is slow | cold start of the function (Nest + TypeORM); expected on serverless |

## 8. Costs (verify current pricing on each site)
| Item | Starting point |
|---|---|
| Vercel | Hobby: free, non-commercial. Pro: about US$ 20/member/month, needed for commercial use |
| Neon | free plan with limits on storage and compute; paid plans scale with usage |
| Upstash Redis | optional; free plan. Each API request uses one REST pipeline (3 commands) |
| GitHub Actions | free minutes for private repositories on the free plan; CI uses about 2 jobs per push |

Re-measure performance on the deployed stack (`docs/architecture/PERFORMANCE.md` was measured on a laptop) and watch cold starts.

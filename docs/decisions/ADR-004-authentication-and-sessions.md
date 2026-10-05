# ADR-004 — Authentication, sessions and invitations

Status: Accepted (Stage 01, 2026-10-04)

## Context
SPA + API on the same site (or sibling subdomains). No email provider in MVP. Financial data warrants conservative session handling.

## Decision
- **Passwords**: argon2id (`argon2` package, OWASP parameters), minimum 10 characters, max 128; checked against a small common-password list.
- **Access token**: JWT (HS256, `JWT_ACCESS_SECRET`), 15 min TTL, claims `sub`, `iat`, `exp`, `jti` only. **No household or role claims** — membership is checked per request so removal is immediate. Kept in memory by the SPA.
- **Refresh token**: opaque 256-bit random value, stored as SHA-256 hash with `familyId`; 30-day TTL; sent as `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie. Each refresh **rotates**; presenting an already-rotated token revokes the entire family (reuse detection). Logout revokes the family.
- **CSRF**: refresh/logout additionally require header `X-Requested-With: couple-finance`; CORS allow-list from env.
- **Rate limiting**: `@nestjs/throttler` on register, login, refresh and invitation accept (per IP; login also per normalized email).
- **Invitations**: 256-bit token, SHA-256 hashed, 7-day expiry, single use, bound to an email; acceptance requires an authenticated user with that email. Delivery: the API returns the link once to the Owner, who shares it manually. A `Mailer` port with a console adapter exists from Stage 04 so a real provider can be plugged in later.
- **Email verification and password reset**: not in MVP (Q-05 accepted; both need an email provider).

## Consequences
+ Immediate revocation, XSS-resistant refresh, simple infra.
− Page reload requires a refresh round-trip (acceptable).
− Without email verification, someone could register using another person's email; impact is limited because invitations also require the secret token.

## Alternatives
- Session cookies with server store only: also fine; JWT access + refresh chosen per the kit's stated stack.
- Passport-local + sessions in Redis: extra infrastructure not justified.

## Amendments (Stage 03 implementation, 2026-10-04)
1. **Concurrent refresh grace window (10 s).** Two tabs can refresh with the same cookie at once. A rotated token presented again **within 10 s** returns `401 REFRESH_TOKEN_ROTATED` without revoking anything; the client waits ~300 ms and retries with the newer cookie. **After 10 s** it is treated as theft: the family is revoked (`REUSE_DETECTED`) and a security event is logged. Rotation locks the token row (`SELECT … FOR UPDATE`), so simultaneous requests cannot both rotate.
2. **No `JWT_REFRESH_SECRET`.** Refresh tokens are opaque 256-bit values stored as plain SHA-256; a key adds nothing at that entropy. The variable was removed from `.env.example`.
3. **Anti-CSRF header on every `/auth/*` endpoint**, including register and login (prevents login CSRF), not only refresh/logout.
4. **`Secure` cookie attribute only when `NODE_ENV=production`.** Some local clients reject Secure cookies over `http://localhost`. Cookie: `cf_refresh`, `HttpOnly; SameSite=Strict; Path=/api/v1/auth`, sliding 30-day expiry per rotation.
5. **Rate limiting**: per IP across `/auth/*` (`AUTH_RATE_LIMIT_PER_MINUTE`, default 20/min) plus per normalized email on login (`LOGIN_RATE_LIMIT_PER_EMAIL`, default 10 per 15 min). Counters are **in memory per API instance**. Multi-instance deployments need a shared store (Stage 13). Behind a reverse proxy, Express `trust proxy` must be configured so `req.ip` is the client (Stage 13).
6. **Password policy**: 10–128 Unicode code points (NIST SP 800-63B), deny-list of common passwords (global and pt-BR), rejects passwords containing the email local part; argon2id at the OWASP baseline (m=19 MiB, t=2, p=1) with transparent rehash on login.
7. **Global guard, secure by default**: every route requires a Bearer token unless marked `@Public()`. The guard also checks that the user still exists (not soft-deleted) on each request.
8. **Expired access token** → `401 TOKEN_EXPIRED` (client refreshes once and retries); any other problem → `401 UNAUTHENTICATED`.

## Amendments (Stage 12 hardening, 2026-10-05)
9. **General API rate limit** (`api` throttler, `API_RATE_LIMIT_PER_MINUTE`, default 300/min).
   - **Scope:** every endpoint except `/auth/*` and `/invitations/*`, which keep their stricter per-IP limit.
   - **Counting:** per signed-in user; anonymous requests count per IP. A couple behind the same router never shares a budget.
   - **Enforcement:** the global `ApiRateLimitGuard` runs right after the JWT guard, so it already knows the user. It only evaluates the `api` throttler.
   - **Response:** `429 RATE_LIMITED` with `Retry-After`.
   - **Storage:** counters are in memory, like the auth limits; a shared store comes in Stage 13.
10. **Stage 13 (deployment):**
    - The `api` budget is keyed per user (or IP) **across all endpoints**: the guard overrides the per-handler key.
    - Counters can live in Upstash Redis (`RedisThrottlerStorage`, REST API, fixed window, fail-open) when `RATE_LIMIT_REDIS_REST_*` or the Marketplace `KV_REST_API_*` variables are set.
    - Express `trust proxy` is configurable (`TRUST_PROXY`; `true` on Vercel). See ADR-018.


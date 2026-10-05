# Security & Privacy Assumptions and Threat Model

Related ADRs: 004 (auth), 005 (roles/privacy), 008 (audit), 018 (deployment).

## 1. Assets
1. Credentials and sessions (password hashes, refresh tokens, invitation tokens).
2. Household financial records (transactions, income, goals).
3. Membership/authorization state (who can see which household).
4. Personal data (email, name) — LGPD.

## 2. Trust boundaries
Browser SPA ↔ API (public internet) ↔ PostgreSQL (private network). Only the API talks to the database. No third-party processors in MVP (no email provider, analytics SDK, or LLM).

## 3. Threats and mitigations (STRIDE, focused)

| Area | Threat | Mitigation |
|---|---|---|
| Auth | Credential stuffing / brute force | argon2id; rate limit per IP + per email on login; generic `INVALID_CREDENTIALS`; constant-time-ish path (hash a dummy when user not found). |
| Auth | Account enumeration on register | 409 `EMAIL_ALREADY_REGISTERED` is an accepted MVP trade-off (no email verification yet); rate limited. Revisit with Q-05. |
| Auth | Stolen refresh token | httpOnly + Secure (production) + `SameSite=Strict` cookie scoped to `/api/v1/auth`; SHA-256 at rest; rotation under row lock; reuse after a 10 s grace window → revoke family + security log (ADR-004 amendments). |
| Auth | Stolen access token (XSS) | Kept in memory only (not localStorage); 15 min TTL; HS256 pinned (no `alg: none`), issuer/audience checked; strict CSP in production; React escaping; no `dangerouslySetInnerHTML`. |
| Web | Open redirect via `?redirect=` after login | Only same-app paths accepted (`safeRedirectPath`). |
| CSRF | Cookie-authenticated refresh, login CSRF | `SameSite=Strict` + custom header `X-Requested-With` on every `/auth/*` endpoint; CORS allow-list. |
| Invitations | Token guessing / replay / hijack / leakage | 256-bit random token, SHA-256 hashed at rest, 7-day expiry, single use, accepted only by an authenticated user whose email matches; rate limited; token never logged. The link carries the token in the URL **fragment** (`/convite#t=…`), which browsers never send to servers or in `Referer`; the web app moves it to tab-scoped `sessionStorage` during sign-in and deletes it after acceptance. Preview shows only household name, inviter name and a masked email. |
| Tenancy | IDOR across households | Membership guard on every `/households/{id}/…` route; repositories require `householdId` in every query; foreign ids validated within same household; 404 on mismatch; e2e tests per module. |
| Tenancy | Removed member keeps access | Membership checked on every request (no membership in JWT claims). |
| Privacy | Partner sees `RATIO_ONLY` income values | Viewer-aware projections in incomes, analytics and audit; split snapshot stores bps only. See §5 caveat. |
| Integrity | Tampered split / negative amounts | Server recomputes allocations; validation; DB checks + deferred sum trigger. |
| Integrity | Lost updates | Optimistic locking (`version`). |
| Repudiation | "I didn't change that" | `AuditEvent` with actor, request id, before/after. |
| Info disclosure | Stack traces / PII in logs | Global exception filter; pino redaction (authorization, cookies, password, token, `*Cents` in bodies); no request body logging. |
| DoS | Expensive analytics queries | Bounded ranges (max 24 months per request), pagination caps, rate limiting. |
| Supply chain | Malicious dependency | Lockfile, `pnpm audit` in CI (Stage 13), minimal dependencies. |

## 4. Data protection (LGPD-minded)
- Data minimization: no CPF, bank data, phone, address in MVP.
- Purpose: household financial organization only; no data sale/sharing.
- Erasure: account deletion (Q-04 accepted): anonymize the user (email/name replaced, credentials removed), keep household records referencing the member as "Ex-membro" so the remaining partner's history stays consistent; delete the household entirely if no active members remain.
- Secrets via environment; `.env` never committed; `.env.example` holds placeholders only.

## 5. Privacy decisions (Stage 01)
- **Transactions, including `INDIVIDUAL`, are visible to every household member.** (User decision.)
- **Income visibility is chosen per member** (`EXACT` or `RATIO_ONLY`, default `RATIO_ONLY`). (User decision.)
- **Inference caveat:** in a two-person household, a member who knows their own income and sees the proportion (e.g. 60/40) can derive the partner's income exactly; the same holds for "income commitment %" analytics. `RATIO_ONLY` therefore means "not displayed", not "mathematically secret". The UI must state this when a member selects `RATIO_ONLY`. Accepted (Q-02).

## 6. Neutral language guidelines
- Use "contribuiu", "pagou", "saldo de contribuição", "compensar"; avoid "deve", "dívida", "culpa", "gastou demais".
- Describe facts with evidence, not judgments: "Supermercado ficou 32% acima da média dos últimos 3 meses".
- Never rank partners; show both members symmetrically.

## 7. Threat model re-verification (Stage 12, 2026-10-05)

| Area | Status | Evidence / change |
|---|---|---|
| Brute force, enumeration | Verified | argon2id, per-IP + per-email login limits (`rate-limit.e2e-spec`); 409 on register accepted (Q-05). |
| Stolen refresh/access token | Verified | httpOnly + SameSite=Strict cookie on `/api/v1/auth`, rotation + reuse detection (auth e2e); access token in memory only; no `dangerouslySetInnerHTML` in the web. `Secure` in production and the web CSP are part of deployment (Stage 13). |
| CSRF / open redirect | Verified | `X-Requested-With` on `/auth/*`; `safeRedirectPath` tests. |
| Invitations | Verified | Token in the URL fragment, hashed at rest, single use, email match (households e2e). |
| Tenancy / IDOR | Verified | Every module's e2e includes a cross-household 404 (analytics and insights added in Stages 10–11). |
| Privacy (RATIO_ONLY) | Verified | Incomes, analytics (`incomeVisible`) and audit are viewer-aware; analytics e2e checks both sides. |
| Integrity / lost updates | Verified | DB checks, deferred sum trigger, `version` conflicts (ledger, commitments, planning e2e). |
| Info disclosure in logs | **Fixed in Stage 12** | Request logs now carry the path only (query strings may hold search text). Database error values (`parameters`, Postgres `detail` such as "Key (email)=(…)") are redacted. Unit-tested with pino (`logging/redaction.spec.ts`). Bodies are still never logged; the client never sees stack traces (`all-exceptions.filter.spec`). |
| DoS on read models | **Fixed in Stage 12** | General per-user rate limit (ADR-004 amendment 9, e2e). Ranges were already bounded (24 months; page size 100). Measured p95 ≤ 91 ms with 5 years of data (`PERFORMANCE.md`). |
| Supply chain | **Fixed in Stage 12** | `pnpm audit --prod`: one moderate advisory (js-yaml via `@nestjs/swagger`), fixed with a pnpm override to 5.4.2; now "No known vulnerabilities found". CI gate in Stage 13. |
| Demo data | Added | `pnpm db:seed:demo` refuses `NODE_ENV=production`; its password is local-only (`DEMO_PASSWORD` overrides it). |

Open for Stage 13: Express `trust proxy` behind the reverse proxy, a shared rate-limit store for more than one instance, HTTPS-only cookies in production, a CSP/security headers for the static web, and Swagger exposure in production.

**Closed in Stage 13 (ADR-018):**
- `TRUST_PROXY=true` on Vercel. With Services, requests reach the API directly from Vercel's edge, which overwrites `X-Forwarded-For` with the client IP.
- Shared rate-limit counters through Upstash Redis (optional, fail-open). The general budget is one per user across endpoints.
- Production is detected on Vercel (`VERCEL=1`), so cookies are `Secure` and Swagger is off.
- Strict CSP and security headers for the web service: `script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`, HSTS, `nosniff`. Checked with zero violations on 11 screens.
- `pnpm audit --prod` runs as a CI gate.
- `.vercelignore` keeps `.env` files out of CLI uploads; secrets live only in Vercel environment variables.


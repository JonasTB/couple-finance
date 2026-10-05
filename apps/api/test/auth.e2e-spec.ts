import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  CSRF,
  STRONG_PASSWORD,
  refreshCookie,
  refreshCookieHeader,
  register,
  uniqueEmail,
} from './auth-helpers';
import { createTestApp, FakeClock } from './create-test-app';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let db: DataSource;
  const clock = new FakeClock();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    server = app.getHttpServer();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates the account, returns a session and sets a hardened refresh cookie', async () => {
      const email = uniqueEmail('Alex');
      const { response, cookie } = await register(server, {
        email: `  ${email.toUpperCase()}  `,
        displayName: '  Alex  ',
      });

      expect(response.body).toEqual({
        accessToken: expect.any(String) as unknown,
        accessTokenExpiresAt: expect.stringMatching(/Z$/) as unknown,
        user: {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
          email: email.toLowerCase(),
          displayName: 'Alex',
          createdAt: expect.stringMatching(/Z$/) as unknown,
        },
      });

      const header = refreshCookieHeader(response) ?? '';
      expect(header).toMatch(/HttpOnly/);
      expect(header).toMatch(/SameSite=Strict/);
      expect(header).toMatch(/Path=\/api\/v1\/auth/);
      expect(header).toMatch(/Expires=/);

      // Only hashes are stored: never the raw password or refresh token.
      const [user] = await db.query<{ password_hash: string }[]>(
        `SELECT password_hash FROM users WHERE email = $1`,
        [email],
      );
      expect(user?.password_hash).toMatch(/^\$argon2id\$/);
      const rawToken = cookie.split('=')[1] ?? '';
      const stored = await db.query<unknown[]>(
        `SELECT 1 FROM refresh_tokens WHERE token_hash = $1`,
        [rawToken],
      );
      expect(stored).toHaveLength(0);
    });

    it('rejects a duplicate email regardless of case and whitespace', async () => {
      const { email } = await register(server);
      const response = await request(server)
        .post('/api/v1/auth/register')
        .set(CSRF)
        .send({ email: ` ${email.toUpperCase()} `, password: STRONG_PASSWORD, displayName: 'B' })
        .expect(409);
      expect(response.body).toMatchObject({ error: { code: 'EMAIL_ALREADY_REGISTERED' } });
    });

    it('rejects concurrent duplicate sign-ups without a server error', async () => {
      const email = uniqueEmail();
      const attempt = () =>
        request(server)
          .post('/api/v1/auth/register')
          .set(CSRF)
          .send({ email, password: STRONG_PASSWORD, displayName: 'Alex' });
      const statuses = (await Promise.all([attempt(), attempt(), attempt()])).map((r) => r.status);
      expect(statuses.sort()).toEqual([201, 409, 409]);
      // Three argon2id hashes run in parallel on purpose (slow by design): allow for a busy CI.
    }, 20_000);

    it.each([
      ['a common password', { password: 'Senha12345' }, 'password'],
      [
        'a password containing the email',
        { email: 'jordan.costa@example.com', password: 'jordan.costa!2026' },
        'password',
      ],
      ['a short password', { password: 'abc123' }, 'password'],
      ['an invalid email', { email: 'not-an-email' }, 'email'],
      ['an empty display name', { displayName: '   ' }, 'displayName'],
    ])('rejects %s with VALIDATION_FAILED', async (_label, overrides, field) => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .set(CSRF)
        .send({
          email: uniqueEmail(),
          password: STRONG_PASSWORD,
          displayName: 'Alex',
          ...overrides,
        })
        .expect(400);
      expect(response.body).toMatchObject({
        error: { code: 'VALIDATION_FAILED', details: { fields: [{ field }] } },
      });
    });

    it('rejects unknown properties', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .set(CSRF)
        .send({ email: uniqueEmail(), password: STRONG_PASSWORD, displayName: 'A', role: 'admin' })
        .expect(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('requires the anti-CSRF header', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: STRONG_PASSWORD, displayName: 'Alex' })
        .expect(403);
      expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with case-insensitive email and sets the refresh cookie', async () => {
      const { email } = await register(server);
      const response = await request(server)
        .post('/api/v1/auth/login')
        .set(CSRF)
        .send({ email: email.toUpperCase(), password: STRONG_PASSWORD })
        .expect(200);
      expect(response.body).toMatchObject({ user: { email } });
      expect(refreshCookie(response)).toBeDefined();
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const { email } = await register(server);
      const wrongPassword = await request(server)
        .post('/api/v1/auth/login')
        .set(CSRF)
        .send({ email, password: 'not the right password' })
        .expect(401);
      const unknownEmail = await request(server)
        .post('/api/v1/auth/login')
        .set(CSRF)
        .send({ email: uniqueEmail(), password: 'not the right password' })
        .expect(401);

      const strip = (body: unknown) => ({
        ...(body as { error: object }).error,
        requestId: undefined,
      });
      expect(strip(wrongPassword.body)).toEqual(strip(unknownEmail.body));
      expect(wrongPassword.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
      expect(refreshCookie(wrongPassword)).toBeUndefined();
    });
  });

  describe('GET/PATCH /api/v1/me (protected by default)', () => {
    it('returns the profile for a valid access token', async () => {
      const { accessToken, email } = await register(server);
      const response = await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(response.body).toMatchObject({ email, displayName: 'Alex' });
    });

    it.each([
      ['no Authorization header', undefined],
      ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
      ['a malformed token', 'Bearer not-a-jwt'],
    ])('rejects %s with UNAUTHENTICATED', async (_label, header) => {
      const call = request(server).get('/api/v1/me');
      const response = await (header ? call.set('Authorization', header) : call).expect(401);
      expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    });

    it('rejects an expired access token with TOKEN_EXPIRED', async () => {
      const { accessToken } = await register(server);
      clock.advance(16 * MINUTE);
      const response = await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
      expect(response.body).toMatchObject({ error: { code: 'TOKEN_EXPIRED' } });
    });

    it('rejects tokens of a user that no longer exists', async () => {
      const { accessToken, email } = await register(server);
      await db.query(`UPDATE users SET deleted_at = now() WHERE email = $1`, [email]);
      await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('updates the display name (trimmed) and validates it', async () => {
      const { accessToken } = await register(server);
      const updated = await request(server)
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayName: '  Sam  ' })
        .expect(200);
      expect(updated.body).toMatchObject({ displayName: 'Sam' });

      await request(server)
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayName: 'x'.repeat(61) })
        .expect(400);
    });

    it('keeps /api/health public', async () => {
      await request(server).get('/api/health').expect(200);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    const refresh = (cookie?: string) => {
      const call = request(server).post('/api/v1/auth/refresh').set(CSRF);
      return cookie ? call.set('Cookie', cookie) : call;
    };

    it('rotates the refresh token and returns a working access token', async () => {
      const { cookie } = await register(server);
      const response = await refresh(cookie).expect(200);
      const rotated = refreshCookie(response);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(cookie);

      const { accessToken } = response.body as { accessToken: string };
      await request(server)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('tells a concurrent (same-instant) replay to retry, without ending the session', async () => {
      const { cookie } = await register(server);
      const first = await refresh(cookie).expect(200);
      const replay = await refresh(cookie).expect(401);

      expect(replay.body).toMatchObject({ error: { code: 'REFRESH_TOKEN_ROTATED' } });
      expect(refreshCookieHeader(replay)).toBeUndefined(); // cookie untouched
      await refresh(refreshCookie(first)).expect(200); // newer token still valid
    });

    it('serializes truly simultaneous refreshes: exactly one rotation wins', async () => {
      const { cookie } = await register(server);
      const results = await Promise.all([refresh(cookie), refresh(cookie), refresh(cookie)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 401, 401]);
      for (const loser of results.filter((r) => r.status === 401)) {
        expect(loser.body).toMatchObject({ error: { code: 'REFRESH_TOKEN_ROTATED' } });
      }
    });

    it('detects reuse after the grace window and revokes the whole family', async () => {
      const { cookie: stolen } = await register(server);
      const legit = refreshCookie(await refresh(stolen).expect(200));

      clock.advance(11_000);
      const reuse = await refresh(stolen).expect(401);
      expect(reuse.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
      expect(refreshCookieHeader(reuse)).toMatch(/^cf_refresh=;/); // cleared

      // The legitimate holder of the newer token is logged out as well.
      await refresh(legit).expect(401);
      const [row] = await db.query<{ revoked: number }[]>(
        `SELECT count(*)::int AS revoked FROM refresh_tokens
         WHERE revoked_reason = 'REUSE_DETECTED' AND family_id =
           (SELECT family_id FROM refresh_tokens WHERE token_hash = encode(sha256($1::bytea), 'hex'))`,
        [stolen.split('=')[1]],
      );
      expect(row?.revoked).toBe(2);
    });

    it('rejects an expired refresh token', async () => {
      const { cookie } = await register(server);
      clock.advance(31 * DAY);
      await refresh(cookie).expect(401);
    });

    it('rejects a missing or unknown cookie and clears it', async () => {
      await refresh().expect(401);
      const unknown = await refresh('cf_refresh=definitely-not-a-real-token').expect(401);
      expect(refreshCookieHeader(unknown)).toMatch(/^cf_refresh=;/);
    });

    it('requires the anti-CSRF header', async () => {
      const { cookie } = await register(server);
      await request(server).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(403);
    });

    it('rejects refresh for a deleted user', async () => {
      const { cookie, email } = await register(server);
      await db.query(`UPDATE users SET deleted_at = now() WHERE email = $1`, [email]);
      await refresh(cookie).expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the session family and clears the cookie', async () => {
      const { cookie } = await register(server);
      const rotated = refreshCookie(
        await request(server)
          .post('/api/v1/auth/refresh')
          .set(CSRF)
          .set('Cookie', cookie)
          .expect(200),
      );

      const response = await request(server)
        .post('/api/v1/auth/logout')
        .set(CSRF)
        .set('Cookie', rotated ?? '')
        .expect(204);
      expect(refreshCookieHeader(response)).toMatch(/^cf_refresh=;/);

      await request(server)
        .post('/api/v1/auth/refresh')
        .set(CSRF)
        .set('Cookie', rotated ?? '')
        .expect(401);
    });

    it('is idempotent without a session', async () => {
      await request(server).post('/api/v1/auth/logout').set(CSRF).expect(204);
    });

    it('leaves other sessions (other devices) untouched', async () => {
      const { email, cookie: phone } = await register(server);
      const laptop = refreshCookie(
        await request(server)
          .post('/api/v1/auth/login')
          .set(CSRF)
          .send({ email, password: STRONG_PASSWORD })
          .expect(200),
      );
      await request(server)
        .post('/api/v1/auth/logout')
        .set(CSRF)
        .set('Cookie', laptop ?? '')
        .expect(204);
      await request(server).post('/api/v1/auth/refresh').set(CSRF).set('Cookie', phone).expect(200);
    });
  });
});

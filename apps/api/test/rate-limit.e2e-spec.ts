import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { CSRF, register, STRONG_PASSWORD, uniqueEmail } from './auth-helpers';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Low limits for this file only. The app module (and its env validation) is loaded after
    // these values are set, through a dynamic import.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '5';
    process.env.LOGIN_RATE_LIMIT_PER_EMAIL = '3';
    process.env.API_RATE_LIMIT_PER_MINUTE = '3';
    const { createTestApp } = await import('./create-test-app');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits login attempts per email, then per IP, with RATE_LIMITED', async () => {
    const server = app.getHttpServer();
    const target = uniqueEmail('target');
    const attempt = (email: string) =>
      request(server)
        .post('/api/v1/auth/login')
        .set(CSRF)
        .send({ email, password: STRONG_PASSWORD });

    for (let i = 0; i < 3; i += 1) {
      await attempt(target).expect(401);
    }
    const blocked = await attempt(` ${target.toUpperCase()} `).expect(429);
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(blocked.headers['retry-after']).toBeDefined();

    // Every request (including the blocked one) spends the per-IP budget of 5/min:
    // request 5 still passes, request 6 is throttled whatever the email.
    await attempt(uniqueEmail()).expect(401);
    await attempt(uniqueEmail()).expect(429);
  });
});

describe('General API rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Same low limits as above (set before the app module is first imported); a fresh app has
    // its own throttler storage.
    process.env.API_RATE_LIMIT_PER_MINUTE = '3';
    const { createTestApp } = await import('./create-test-app');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits signed-in requests per user, separately from the auth limits', async () => {
    const server = app.getHttpServer();
    const ana = await register(server);
    const bruno = await register(server);
    const list = (token: string) =>
      request(server).get('/api/v1/households').set('Authorization', `Bearer ${token}`);

    const me = (token: string) =>
      request(server).get('/api/v1/me').set('Authorization', `Bearer ${token}`);

    // One budget per user across endpoints (not per route).
    await list(ana.accessToken).expect(200);
    await list(ana.accessToken).expect(200);
    await me(ana.accessToken).expect(200);
    await me(ana.accessToken).expect(429);
    const blocked = await list(ana.accessToken).expect(429);
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    // Counted per user: the partner is not affected.
    await list(bruno.accessToken).expect(200);
  });
});

import { randomUUID } from 'node:crypto';
import { AUTH_CSRF_HEADER, AUTH_CSRF_HEADER_VALUE } from '@couple-finance/shared';
import request, { type Response } from 'supertest';
import { type App } from 'supertest/types';

export const CSRF = { [AUTH_CSRF_HEADER]: AUTH_CSRF_HEADER_VALUE };
export const STRONG_PASSWORD = 'cafe com leite na varanda';

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}.${randomUUID()}@example.com`;
}

/** Returns the raw `Set-Cookie` line for the refresh cookie, if any. */
export function refreshCookieHeader(response: Response): string | undefined {
  const raw: unknown = response.headers['set-cookie'];
  const lines = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return lines.find((line) => line.startsWith('cf_refresh='));
}

/** `cf_refresh=<value>` pair to send back, or undefined when the cookie was cleared/absent. */
export function refreshCookie(response: Response): string | undefined {
  const pair = refreshCookieHeader(response)?.split(';')[0];
  return pair && pair !== 'cf_refresh=' ? pair : undefined;
}

export async function register(
  server: App,
  overrides: Partial<{ email: string; password: string; displayName: string }> = {},
): Promise<{ response: Response; email: string; accessToken: string; cookie: string }> {
  const email = overrides.email ?? uniqueEmail();
  const response = await request(server)
    .post('/api/v1/auth/register')
    .set(CSRF)
    .send({ email, password: STRONG_PASSWORD, displayName: 'Alex', ...overrides })
    .expect(201);
  const body = response.body as { accessToken: string };
  const cookie = refreshCookie(response);
  if (!cookie) {
    throw new Error('register did not set the refresh cookie');
  }
  return { response, email, accessToken: body.accessToken, cookie };
}

import type { AuthSession } from '@couple-finance/shared';
import { request } from '@/shared/api/request';
import { CSRF_HEADERS, endSession, startSession } from '@/shared/auth/session';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

export async function login(input: LoginInput): Promise<void> {
  startSession(
    await request<AuthSession>('/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      json: input,
    }),
  );
}

export async function register(input: RegisterInput): Promise<void> {
  startSession(
    await request<AuthSession>('/v1/auth/register', {
      method: 'POST',
      headers: CSRF_HEADERS,
      json: input,
    }),
  );
}

/** Ends the local session even if the server call fails (e.g. offline). */
export async function logout(): Promise<void> {
  try {
    await request<undefined>('/v1/auth/logout', { method: 'POST', headers: CSRF_HEADERS });
  } finally {
    endSession();
  }
}

import {
  AUTH_CSRF_HEADER,
  AUTH_CSRF_HEADER_VALUE,
  type AuthSession,
  ErrorCode,
  type UserProfile,
} from '@couple-finance/shared';
import { useSyncExternalStore } from 'react';
import { ApiError, request } from '@/shared/api/request';

/**
 * In-memory session (ADR-004): the access token never touches localStorage. On page load the
 * session is restored from the httpOnly refresh cookie via `refreshSession()`.
 */
export type SessionState =
  | { status: 'unknown' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; accessToken: string; user: UserProfile };

let state: SessionState = { status: 'unknown' };
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function getSession(): SessionState {
  return state;
}

export function getAccessToken(): string | undefined {
  return state.status === 'authenticated' ? state.accessToken : undefined;
}

export function startSession(session: AuthSession): void {
  setState({ status: 'authenticated', accessToken: session.accessToken, user: session.user });
}

export function endSession(): void {
  setState({ status: 'anonymous' });
}

export function updateSessionUser(user: UserProfile): void {
  if (state.status === 'authenticated') {
    setState({ ...state, user });
  }
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export const CSRF_HEADERS = { [AUTH_CSRF_HEADER]: AUTH_CSRF_HEADER_VALUE };

/** Delay before retrying when another tab rotated the refresh cookie a moment ago. */
const ROTATION_RETRY_DELAY_MS = 300;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callRefresh(): Promise<AuthSession> {
  return request<AuthSession>('/v1/auth/refresh', { method: 'POST', headers: CSRF_HEADERS });
}

async function performRefresh(): Promise<boolean> {
  try {
    let session: AuthSession;
    try {
      session = await callRefresh();
    } catch (error) {
      if (!(error instanceof ApiError && error.code === ErrorCode.REFRESH_TOKEN_ROTATED)) {
        throw error;
      }
      await wait(ROTATION_RETRY_DELAY_MS);
      session = await callRefresh(); // the browser now holds the newer cookie
    }
    startSession(session);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      endSession();
      return false;
    }
    // Network/server problems: keep the current state so a transient outage does not log out.
    if (state.status === 'unknown') {
      endSession();
    }
    return false;
  }
}

let inFlight: Promise<boolean> | undefined;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one request
 * (single flight), which avoids rotating the same token twice from one tab.
 */
export function refreshSession(): Promise<boolean> {
  inFlight ??= performRefresh().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

/** Test helper. */
export function resetSessionForTests(): void {
  inFlight = undefined;
  setState({ status: 'unknown' });
}

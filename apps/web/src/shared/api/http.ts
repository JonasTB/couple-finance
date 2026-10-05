import { ErrorCode } from '@couple-finance/shared';
import { getAccessToken, refreshSession } from '@/shared/auth/session';
import { ApiError, request, type RequestOptions } from './request';

export { ApiError, type ClientErrorCode } from './request';

function withAuthorization(options: RequestOptions): RequestOptions {
  const token = getAccessToken();
  if (!token) {
    return options;
  }
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...options, headers };
}

/**
 * Authenticated API call. On `TOKEN_EXPIRED` it refreshes the session once and retries;
 * if the refresh fails the original error surfaces and the session is ended.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await request<T>(path, withAuthorization(options));
  } catch (error) {
    if (!(error instanceof ApiError && error.code === ErrorCode.TOKEN_EXPIRED)) {
      throw error;
    }
    if (!(await refreshSession())) {
      throw error;
    }
    return request<T>(path, withAuthorization(options));
  }
}

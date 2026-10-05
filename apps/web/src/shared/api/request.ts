import type { ApiErrorEnvelope, ErrorCode } from '@couple-finance/shared';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

/** Error thrown by API calls, always carrying a machine code (API_CONVENTIONS.md §6). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Response body is not valid JSON.');
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialized as JSON with the matching Content-Type. */
  json?: unknown;
  /** Non-2xx statuses whose body is a normal payload (e.g. 503 from /api/health). */
  payloadStatuses?: number[];
}

/**
 * Low-level call to the same-origin API (`/api`, proxied by Vite in development).
 * No authentication here: see `apiFetch` (shared/api/http.ts).
 * The response type parameter is trusted: the API is the single source of these contracts.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { payloadStatuses = [], headers, json, ...init } = options;
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }
  if (json !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: requestHeaders,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }

  const body = await readJson(response);
  if (response.ok || payloadStatuses.includes(response.status)) {
    return body as T;
  }
  if (isApiErrorEnvelope(body)) {
    const { code, message, details, requestId } = body.error;
    throw new ApiError(response.status, code, message, details, requestId);
  }
  throw new ApiError(response.status, 'INVALID_RESPONSE', `Unexpected HTTP ${response.status}.`);
}

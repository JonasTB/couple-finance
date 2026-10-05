/** Routes `fetch` calls by "METHOD /path" to queued responses; records every call. */
export interface MockResponse {
  status: number;
  body?: unknown;
}

export function installFetchMock(routes: Record<string, MockResponse | MockResponse[]>) {
  const queues = new Map(
    Object.entries(routes).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );
  const calls: { key: string; init: RequestInit | undefined }[] = [];

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push({ key, init });
    const queue = queues.get(key);
    // The last queued response repeats once the queue is drained.
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (!next) {
      return Promise.reject(new Error(`Unexpected fetch: ${key}`));
    }
    const body = next.body === undefined ? null : JSON.stringify(next.body);
    return Promise.resolve(new Response(body, { status: next.status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    count: (key: string) => calls.filter((call) => call.key === key).length,
    /** Parsed JSON body of the first call to `key`. */
    jsonBody: (key: string): unknown => {
      const body = calls.find((call) => call.key === key)?.init?.body;
      if (typeof body !== 'string') {
        throw new Error(`No JSON body sent to ${key}`);
      }
      return JSON.parse(body) as unknown;
    },
  };
}

export const sessionBody = (accessToken = 'access-1', displayName = 'Alex') => ({
  accessToken,
  accessTokenExpiresAt: '2026-10-04T12:15:00.000Z',
  user: { id: 'u1', email: 'alex@example.com', displayName, createdAt: '2026-10-04T12:00:00.000Z' },
});

export const errorBody = (code: string, extra: object = {}) => ({
  error: { code, message: code, ...extra },
});

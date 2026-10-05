import { ApiError, request as apiFetch } from './request';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes /api and returns the JSON payload', async () => {
    mockFetch(200, { ok: true });
    await expect(apiFetch('/health')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('turns the error envelope into an ApiError with code and request id', async () => {
    mockFetch(409, {
      error: { code: 'CONFLICT', message: 'Version conflict.', details: { v: 2 }, requestId: 'r1' },
    });
    const error = await apiFetch('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { v: 2 },
      requestId: 'r1',
    });
  });

  it('accepts declared payload statuses', async () => {
    mockFetch(503, { status: 'degraded' });
    await expect(apiFetch('/health', { payloadStatuses: [503] })).resolves.toEqual({
      status: 'degraded',
    });
  });

  it('reports non-envelope failures as INVALID_RESPONSE', async () => {
    mockFetch(502, { foo: 'bar' });
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('request JSON bodies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes `json` and sets the Content-Type', async () => {
    mockFetch(200, {});
    await apiFetch('/x', { method: 'POST', json: { a: 1 } });
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(init?.body).toBe('{"a":1}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });
});

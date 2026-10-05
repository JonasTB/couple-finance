import { errorBody, installFetchMock, sessionBody } from '@/test/fetch-mock';
import { resetSessionForTests, startSession } from '@/shared/auth/session';
import { apiFetch } from './http';

const ME = 'GET /api/v1/me';
const REFRESH = 'POST /api/v1/auth/refresh';

describe('apiFetch', () => {
  beforeEach(() => {
    resetSessionForTests();
    startSession(sessionBody('expired-token'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token', async () => {
    const mock = installFetchMock({ [ME]: { status: 200, body: { id: 'u1' } } });
    await apiFetch('/v1/me');
    expect(new Headers(mock.calls[0]?.init?.headers).get('Authorization')).toBe(
      'Bearer expired-token',
    );
  });

  it('refreshes once on TOKEN_EXPIRED and retries with the new token', async () => {
    const mock = installFetchMock({
      [ME]: [
        { status: 401, body: errorBody('TOKEN_EXPIRED') },
        { status: 200, body: { id: 'u1' } },
      ],
      [REFRESH]: { status: 200, body: sessionBody('fresh-token') },
    });
    await expect(apiFetch('/v1/me')).resolves.toEqual({ id: 'u1' });
    expect(mock.count(REFRESH)).toBe(1);
    expect(new Headers(mock.calls[2]?.init?.headers).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
  });

  it('surfaces the error when the refresh fails', async () => {
    installFetchMock({
      [ME]: { status: 401, body: errorBody('TOKEN_EXPIRED') },
      [REFRESH]: { status: 401, body: errorBody('UNAUTHENTICATED') },
    });
    await expect(apiFetch('/v1/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('does not refresh on other 401 errors', async () => {
    const mock = installFetchMock({ [ME]: { status: 401, body: errorBody('UNAUTHENTICATED') } });
    await expect(apiFetch('/v1/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(mock.count(REFRESH)).toBe(0);
  });
});

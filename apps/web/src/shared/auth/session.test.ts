import { errorBody, installFetchMock, sessionBody } from '@/test/fetch-mock';
import { getSession, refreshSession, resetSessionForTests } from './session';

const REFRESH = 'POST /api/v1/auth/refresh';

describe('refreshSession', () => {
  beforeEach(() => {
    resetSessionForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the session and sends the anti-CSRF header', async () => {
    const mock = installFetchMock({ [REFRESH]: { status: 200, body: sessionBody() } });
    await expect(refreshSession()).resolves.toBe(true);
    expect(getSession()).toMatchObject({ status: 'authenticated', accessToken: 'access-1' });
    expect(new Headers(mock.calls[0]?.init?.headers).get('X-Requested-With')).toBe(
      'couple-finance',
    );
  });

  it('shares one request between concurrent callers (single flight)', async () => {
    const mock = installFetchMock({ [REFRESH]: { status: 200, body: sessionBody() } });
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(results).toEqual([true, true, true]);
    expect(mock.count(REFRESH)).toBe(1);
  });

  it('retries once when another tab just rotated the cookie', async () => {
    const mock = installFetchMock({
      [REFRESH]: [
        { status: 401, body: errorBody('REFRESH_TOKEN_ROTATED') },
        { status: 200, body: sessionBody('access-2') },
      ],
    });
    await expect(refreshSession()).resolves.toBe(true);
    expect(mock.count(REFRESH)).toBe(2);
    expect(getSession()).toMatchObject({ accessToken: 'access-2' });
  });

  it('becomes anonymous when there is no valid session', async () => {
    installFetchMock({ [REFRESH]: { status: 401, body: errorBody('UNAUTHENTICATED') } });
    await expect(refreshSession()).resolves.toBe(false);
    expect(getSession()).toEqual({ status: 'anonymous' });
  });
});

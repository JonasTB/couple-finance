import { RedisThrottlerStorage } from './redis-throttler.storage';

const reply = (hits: number, pttl: number) =>
  new Response(JSON.stringify([{ result: hits }, { result: 1 }, { result: pttl }]), {
    status: 200,
  });

describe('RedisThrottlerStorage', () => {
  it('counts hits in a fixed window through one pipeline call', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve(reply(3, 42_100)),
    );
    const storage = new RedisThrottlerStorage('https://redis.example.com/', 'secret', fetchMock);

    const record = await storage.increment('user:u1', 60_000, 5, 60_000, 'api');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 43,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://redis.example.com/pipeline');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer secret' });
    expect(JSON.parse(init?.body as string)).toEqual([
      ['INCR', 'cf:rl:api:user:u1'],
      ['PEXPIRE', 'cf:rl:api:user:u1', '60000', 'NX'],
      ['PTTL', 'cf:rl:api:user:u1'],
    ]);
  });

  it('blocks above the limit until the window ends', async () => {
    const storage = new RedisThrottlerStorage('https://r', 't', () =>
      Promise.resolve(reply(6, 9_000)),
    );
    expect(await storage.increment('k', 60_000, 5, 60_000, 'ip')).toEqual({
      totalHits: 6,
      timeToExpire: 9,
      isBlocked: true,
      timeToBlockExpire: 9,
    });
  });

  it('fails open when Redis is unreachable or answers badly', async () => {
    for (const failing of [
      () => Promise.reject(new Error('network down')),
      () => Promise.resolve(new Response('nope', { status: 500 })),
      () =>
        Promise.resolve(new Response(JSON.stringify([{ error: 'WRONGTYPE' }]), { status: 200 })),
    ]) {
      const storage = new RedisThrottlerStorage('https://r', 't', failing);
      const record = await storage.increment('k', 60_000, 1, 60_000, 'api');
      expect(record.isBlocked).toBe(false);
    }
  });
});

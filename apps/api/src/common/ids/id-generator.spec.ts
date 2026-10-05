import { UuidV7IdGenerator } from './id-generator';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UuidV7IdGenerator', () => {
  const generator = new UuidV7IdGenerator();

  it('produces RFC 9562 version 7 UUIDs', () => {
    expect(generator.next()).toMatch(UUID_V7);
  });

  it('produces unique, time-ordered ids', () => {
    const ids = Array.from({ length: 1000 }, () => generator.next());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});

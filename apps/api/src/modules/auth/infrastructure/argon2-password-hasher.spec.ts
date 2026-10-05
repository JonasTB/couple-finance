import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes with argon2id and the configured parameters', async () => {
    const hash = await hasher.hash('cafe com leite na varanda');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(hasher.needsRehash(hash)).toBe(false);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('cafe com leite na varanda');
    await expect(hasher.verify(hash, 'cafe com leite na varanda')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'cafe com leite na varand')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('same password!'),
      hasher.hash('same password!'),
    ]);
    expect(a).not.toBe(b);
  });

  it('treats a malformed hash as a failed verification', async () => {
    await expect(hasher.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });

  it('flags hashes made with weaker parameters for rehash', () => {
    const weaker =
      '$argon2id$v=19$m=4096,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g';
    expect(hasher.needsRehash(weaker)).toBe(true);
  });
});

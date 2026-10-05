import { checkPassword } from './password-policy';

const email = 'alex.silva@example.com';

describe('checkPassword', () => {
  it('accepts a long, uncommon passphrase', () => {
    expect(checkPassword('cafe com leite na varanda', email)).toEqual([]);
  });

  it('enforces length bounds (counted in characters, not bytes)', () => {
    expect(checkPassword('short', email)).toEqual(['PASSWORD_TOO_SHORT']);
    expect(checkPassword('ção-ção-ç', email)).toEqual(['PASSWORD_TOO_SHORT']);
    expect(checkPassword('ção-ção-çã', email)).toEqual([]);
    expect(checkPassword('x'.repeat(127) + 'y', email)).toEqual([]);
    expect(checkPassword('x'.repeat(128) + 'y', email)).toEqual(['PASSWORD_TOO_LONG']);
  });

  it.each(['1234567890', 'Senha12345', 'QWERTYUIOP', 'aaaaaaaaaaaa'])(
    'rejects common password %s',
    (password) => {
      expect(checkPassword(password, email)).toContain('PASSWORD_TOO_COMMON');
    },
  );

  it('rejects passwords containing the email local part', () => {
    expect(checkPassword('Alex.Silva-2026!', email)).toEqual(['PASSWORD_CONTAINS_EMAIL']);
  });

  it('does not trim or normalize whitespace', () => {
    expect(checkPassword('  1234567890  ', email)).toEqual([]);
  });
});

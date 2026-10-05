import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@couple-finance/shared';

/**
 * Password rules (ADR-004, aligned with NIST SP 800-63B): length over composition rules,
 * plus a deny-list of very common choices. Passwords are never trimmed or normalized.
 */
export type PasswordViolation =
  'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_COMMON' | 'PASSWORD_CONTAINS_EMAIL';

/** Common passwords with ≥ 10 characters (global and Brazilian lists), lower-case. */
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '0987654321',
  '12345678910',
  '123456789a',
  'a123456789',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'qwertyuiop',
  'asdfghjkl;',
  'zaq12wsxcde',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou12',
  'iloveyou123',
  'abcdefghij',
  'abc1234567',
  'abcd123456',
  'qwerty1234',
  'qwerty12345',
  'welcome123',
  'letmein123',
  'football123',
  'sunshine123',
  'princess123',
  'senha12345',
  'senha123456',
  'minhasenha',
  'minhasenha123',
  'mudar12345',
  'mudar@123',
  'brasil1234',
  'brasil12345',
  'flamengo123',
  'corinthians',
  'corinthians123',
  'palmeiras123',
  'saopaulo123',
  'vasco12345',
  'gremio1234',
  'amorzinho123',
  'teamo12345',
  'teamo123456',
  'meuamor123',
  'familia123',
  'jesus12345',
  'deusefiel123',
  'couplefinance',
]);

function isSingleRepeatedCharacter(password: string): boolean {
  return new Set(password).size === 1;
}

export function checkPassword(password: string, email: string): PasswordViolation[] {
  // NIST SP 800-63B: each Unicode code point counts as one character.
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) {
    return ['PASSWORD_TOO_SHORT'];
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return ['PASSWORD_TOO_LONG'];
  }

  const violations: PasswordViolation[] = [];
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || isSingleRepeatedCharacter(password)) {
    violations.push('PASSWORD_TOO_COMMON');
  }
  const localPart = email.split('@')[0]?.toLowerCase() ?? '';
  if (localPart.length >= 4 && lowered.includes(localPart)) {
    violations.push('PASSWORD_CONTAINS_EMAIL');
  }
  return violations;
}

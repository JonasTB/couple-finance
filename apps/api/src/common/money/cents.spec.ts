import fc from 'fast-check';
import { bigintCentsTransformer } from './bigint-cents.transformer';
import { assertSafeCents, centsFromDatabase, isSafeCents } from './cents';

describe('cents helpers', () => {
  it.each([0, 1, -1, 123_456, Number.MAX_SAFE_INTEGER])('accepts safe integer %p', (value) => {
    expect(isSafeCents(value)).toBe(true);
    expect(assertSafeCents(value)).toBe(value);
  });

  it.each([0.5, 10.01, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null])(
    'rejects %p',
    (value) => {
      expect(isSafeCents(value)).toBe(false);
      expect(() => assertSafeCents(value, 'priceCents')).toThrow(/priceCents/);
    },
  );

  it('converts database bigint strings without precision loss', () => {
    expect(centsFromDatabase('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(centsFromDatabase('-42')).toBe(-42);
  });

  it('throws instead of losing precision for values beyond 2^53', () => {
    expect(() => centsFromDatabase('9007199254740992')).toThrow(RangeError);
  });

  it('round-trips any safe integer through the TypeORM transformer', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (value) => {
        const stored = bigintCentsTransformer.to(value);
        expect(bigintCentsTransformer.from(stored)).toBe(value);
      }),
    );
  });

  it('keeps null through the transformer', () => {
    expect(bigintCentsTransformer.to(null)).toBeNull();
    expect(bigintCentsTransformer.from(null)).toBeNull();
  });

  it('refuses to persist fractional cents', () => {
    expect(() => bigintCentsTransformer.to(10.5)).toThrow(RangeError);
  });
});

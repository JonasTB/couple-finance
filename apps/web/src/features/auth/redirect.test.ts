import { safeRedirectPath } from './redirect';

describe('safeRedirectPath', () => {
  it.each([
    ['/orcamentos?mes=2026-10', '/orcamentos?mes=2026-10'],
    [null, '/'],
    ['', '/'],
    ['https://evil.test', '/'],
    ['//evil.test', '/'],
    ['/\\evil.test', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

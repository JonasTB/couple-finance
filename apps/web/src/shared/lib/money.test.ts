import {
  centsToInput,
  formatBps,
  formatCents,
  formatPoints,
  parseMoneyInput,
  parsePercentInput,
} from './money';

describe('parseMoneyInput', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234,5', 123450],
    ['1234', 123400],
    ['0,01', 1],
    ['R$ 12,30', 1230],
    ['  45,90 ', 4590],
    ['1.000.000,00', 100000000],
    ['999.999.999,99', 99999999999],
  ])('parses %s as %i cents', (input, cents) => {
    expect(parseMoneyInput(input)).toBe(cents);
  });

  it.each(['', 'abc', '12.5', '1,234', '12,345', '1.23,45', '-10', '10,', '1.000.000.000,00'])(
    'rejects %j',
    (input) => {
      expect(parseMoneyInput(input)).toBeNull();
    },
  );

  it('round-trips with centsToInput', () => {
    for (const cents of [1, 99, 100, 123456, 99999999999]) {
      expect(parseMoneyInput(centsToInput(cents))).toBe(cents);
    }
  });
});

describe('formatting', () => {
  it('formats cents as BRL', () => {
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatCents(5).replace(/\s/g, ' ')).toBe('R$ 0,05');
  });

  it('formats basis points as percent', () => {
    expect(formatBps(6000)).toBe('60%');
    expect(formatBps(3333)).toBe('33,33%');
    expect(formatPoints(900)).toBe('9 p.p.');
    expect(formatPoints(-399)).toBe('3,99 p.p.');
  });

  it.each([
    ['60', 6000],
    ['33,33', 3333],
    ['33.5', 3350],
    ['100', 10000],
  ])('parses percent %s as %i bps', (input, bps) => {
    expect(parsePercentInput(input)).toBe(bps);
  });

  it.each(['101', '-1', 'x', '1,234'])('rejects percent %j', (input) => {
    expect(parsePercentInput(input)).toBeNull();
  });
});

import { Currency } from './currency';
import { Dec, InvalidAmountError, Money } from './money';

describe('Money', () => {
  describe('parse', () => {
    it.each(['0.1', '100', '1500.123456', '0'])('accepts %s', (value) => {
      expect(Money.parse(Currency.USDx, value).amount.eq(value)).toBe(true);
    });

    it.each(['1e3', '-5', '1.1234567', '01.5', '1.', '.5', 'abc', ' 1'])(
      'rejects %s',
      (value) => {
        expect(() => Money.parse(Currency.USDx, value)).toThrow(
          InvalidAmountError,
        );
      },
    );
  });

  it('adds without floating point drift (0.1 + 0.2)', () => {
    const sum = Money.parse(Currency.USDx, '0.1').add(
      Money.parse(Currency.USDx, '0.2'),
    );
    expect(sum.toString()).toBe('0.300000');
  });

  it('subtracts and detects negative results', () => {
    const result = Money.parse(Currency.cNGN, '10').subtract(
      Money.parse(Currency.cNGN, '10.000001'),
    );
    expect(result.isNegative()).toBe(true);
    expect(result.toString()).toBe('-0.000001');
  });

  it('refuses arithmetic across currencies', () => {
    expect(() =>
      Money.parse(Currency.cNGN, '1').add(Money.parse(Currency.cGHS, '1')),
    ).toThrow(/Currency mismatch/);
  });

  describe('convert', () => {
    it('rounds down to 6 dp so the house never over-credits', () => {
      const converted = Money.parse(Currency.USDx, '1').convert(
        Currency.cNGN,
        new Dec('1550.1234567891'),
      );
      expect(converted.currency).toBe(Currency.cNGN);
      expect(converted.toString()).toBe('1550.123456');
    });

    it('handles tiny amounts converting to sub-unit values', () => {
      const converted = Money.parse(Currency.cNGN, '0.000001').convert(
        Currency.USDx,
        new Dec('0.000645161290'),
      );
      expect(converted.toString()).toBe('0.000000');
    });

    it('rejects non-positive rates', () => {
      expect(() =>
        Money.parse(Currency.USDx, '1').convert(Currency.EURx, new Dec(0)),
      ).toThrow(InvalidAmountError);
    });
  });

  it('serialises to a fixed-scale string', () => {
    expect(JSON.stringify(Money.parse(Currency.EURx, '12.5'))).toBe(
      '{"currency":"EURx","amount":"12.500000"}',
    );
  });

  it('of() rejects values with more than 6 decimal places', () => {
    expect(() => Money.of(Currency.USDx, '1.0000001')).toThrow(
      InvalidAmountError,
    );
  });
});

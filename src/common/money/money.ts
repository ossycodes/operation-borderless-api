import Decimal from 'decimal.js';
import { Currency } from './currency';

/**
 * Number of decimal places every stablecoin amount is stored and returned
 * with. Matches the `NUMERIC(38, 6)` columns in the database.
 */
export const AMOUNT_SCALE = 6;

/** Decimal places FX rates are stored with (`NUMERIC(38, 12)`). */
export const RATE_SCALE = 12;

/** Upper bound for a single operation, to keep inputs sane. */
export const MAX_OPERATION_AMOUNT = '1000000000000'; // 1 trillion units

/**
 * Isolated Decimal constructor: 60 significant digits is far beyond what
 * NUMERIC(38, x) can hold, so intermediate maths never loses precision.
 */
export const Dec = Decimal.clone({
  precision: 60,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Dec = Decimal;

const AMOUNT_PATTERN = new RegExp(
  `^(0|[1-9]\\d{0,25})(\\.\\d{1,${AMOUNT_SCALE}})?$`,
);

export class InvalidAmountError extends Error {}

/**
 * Immutable money value object. Amounts are exact decimals — never JS
 * floats — and always carry their currency so mismatched arithmetic is a
 * programming error, not a silent bug.
 */
export class Money {
  private constructor(
    readonly currency: Currency,
    readonly amount: Decimal,
  ) {}

  /** Parses a client-supplied decimal string (strict: no exponents, ≤ 6 dp). */
  static parse(currency: Currency, value: string): Money {
    if (!AMOUNT_PATTERN.test(value)) {
      throw new InvalidAmountError(
        `Amount must be a decimal string with at most ${AMOUNT_SCALE} decimal places`,
      );
    }
    return new Money(currency, new Dec(value));
  }

  /** Builds from a trusted value (e.g. a NUMERIC column), enforcing scale. */
  static of(currency: Currency, value: Decimal.Value): Money {
    const amount = new Dec(value);
    if (!amount.isFinite())
      throw new InvalidAmountError('Amount must be finite');
    if (amount.decimalPlaces() > AMOUNT_SCALE) {
      throw new InvalidAmountError(
        `Amount ${amount.toString()} exceeds ${AMOUNT_SCALE} decimal places`,
      );
    }
    return new Money(currency, amount);
  }

  static zero(currency: Currency): Money {
    return new Money(currency, new Dec(0));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.currency, this.amount.plus(other.amount));
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.currency, this.amount.minus(other.amount));
  }

  negate(): Money {
    return new Money(this.currency, this.amount.negated());
  }

  /**
   * Converts at `rate` (units of target per 1 unit of this currency).
   * Rounds DOWN to the amount scale so the platform never credits more value
   * than it debited; the sub-micro-unit remainder stays with the house.
   */
  convert(target: Currency, rate: Decimal): Money {
    if (rate.lte(0)) throw new InvalidAmountError('FX rate must be positive');
    return new Money(
      target,
      this.amount.times(rate).toDecimalPlaces(AMOUNT_SCALE, Decimal.ROUND_DOWN),
    );
  }

  isPositive(): boolean {
    return this.amount.gt(0);
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  gt(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.gt(other.amount);
  }

  lt(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lt(other.amount);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.eq(other.amount);
  }

  /** Canonical fixed-scale string, e.g. "1500.250000". */
  toString(): string {
    return this.amount.toFixed(AMOUNT_SCALE);
  }

  toJSON(): { currency: Currency; amount: string } {
    return { currency: this.currency, amount: this.toString() };
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}

/** Formats a rate with the canonical rate scale. */
export function formatRate(rate: Decimal): string {
  return rate.toFixed(RATE_SCALE);
}

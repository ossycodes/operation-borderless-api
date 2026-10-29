import { Injectable } from '@nestjs/common';
import { FiatCode } from '../../common/money/currency';
import { FxRateProvider, UsdRateTable } from './fx-rate-provider';

/**
 * Fixed reference table (units per 1 USD). XAF is derived from its legal
 * peg to the euro (1 EUR = 655.957 XAF) so cXAF/EURx stays consistent.
 *
 * Used as the primary provider in tests/offline mode and as the last-resort
 * fallback when the live provider has never succeeded.
 */
export const STATIC_USD_RATES: Readonly<Record<FiatCode, string>> = {
  USD: '1',
  EUR: '0.92',
  NGN: '1550',
  GHS: '15.5',
  XAF: '603.48044', // 0.92 * 655.957
};

export const STATIC_RATES_AS_OF = '2026-10-01T00:00:00.000Z';

@Injectable()
export class StaticRateProvider implements FxRateProvider {
  readonly name = 'static-table';

  fetchUsdRates(): Promise<UsdRateTable> {
    return Promise.resolve({
      provider: this.name,
      rates: { ...STATIC_USD_RATES },
      asOf: STATIC_RATES_AS_OF,
      fetchedAt: new Date().toISOString(),
    });
  }
}

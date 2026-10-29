import Decimal from 'decimal.js';
import { Currency } from '../common/money/currency';
import type {
  ProviderRateSource,
  UsdRateTable,
} from './providers/fx-rate-provider';

/**
 * Where a rate table came from:
 * - `live`: fresh from the primary provider
 * - `last-known-good`: provider failed; latest persisted snapshot is used
 * - `static`: fixed reference table (offline mode or nothing else available)
 */
export type RateSource = ProviderRateSource | 'last-known-good';

export interface ResolvedRates extends UsdRateTable {
  source: RateSource;
  /** True when served from a fallback because the provider failed. */
  stale: boolean;
}

export interface FxQuote {
  from: Currency;
  to: Currency;
  /** Units of `to` per 1 unit of `from`, rounded to the rate scale. */
  rate: Decimal;
  source: RateSource;
  provider: string;
  asOf: Date;
}

import { FiatCode } from '../../common/money/currency';

export const PRIMARY_FX_PROVIDER = Symbol('PRIMARY_FX_PROVIDER');

/**
 * A table of fiat rates quoted against USD: `rates.NGN = "1532.48"` means
 * 1 USD buys 1532.48 NGN. Values are decimal strings to stay exact.
 */
export interface UsdRateTable {
  provider: string;
  rates: Record<FiatCode, string>;
  /** When the provider says these rates were last updated. */
  asOf: string;
  /** When we fetched them. */
  fetchedAt: string;
}

/** Strategy interface: any FX source (live API, fixed table, ...). */
export interface FxRateProvider {
  readonly name: string;
  fetchUsdRates(): Promise<UsdRateTable>;
}

export class FxProviderError extends Error {}

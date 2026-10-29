import { FiatCode } from '../../common/money/currency';

export const PRIMARY_FX_PROVIDER = Symbol('PRIMARY_FX_PROVIDER');
/** Last resort when the primary fails and no snapshot has ever been stored. */
export const FALLBACK_FX_PROVIDER = Symbol('FALLBACK_FX_PROVIDER');

/** What a provider serves: market rates, or a fixed reference table. */
export type ProviderRateSource = 'live' | 'static';

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
  /** Labels every quote served from this provider's rates. */
  readonly source: ProviderRateSource;
  fetchUsdRates(): Promise<UsdRateTable>;
}

export class FxProviderError extends Error {}

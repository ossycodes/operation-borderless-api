/**
 * Supported mock stablecoins. Each one is pegged 1:1 to a fiat currency, so
 * FX between stablecoins is derived from fiat FX rates.
 */
export enum Currency {
  cNGN = 'cNGN',
  cGHS = 'cGHS',
  cXAF = 'cXAF',
  USDx = 'USDx',
  EURx = 'EURx',
}

export const SUPPORTED_CURRENCIES: readonly Currency[] =
  Object.values(Currency);

export type FiatCode = 'NGN' | 'GHS' | 'XAF' | 'USD' | 'EUR';

export const FIAT_PEG: Readonly<Record<Currency, FiatCode>> = {
  [Currency.cNGN]: 'NGN',
  [Currency.cGHS]: 'GHS',
  [Currency.cXAF]: 'XAF',
  [Currency.USDx]: 'USD',
  [Currency.EURx]: 'EUR',
};

export const REQUIRED_FIAT_CODES: readonly FiatCode[] = Object.values(FIAT_PEG);

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}

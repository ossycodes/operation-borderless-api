import { Repository } from 'typeorm';
import { Currency } from '../common/money/currency';
import { AppConfigService } from '../config/app-config.service';
import { FxRateCache } from './fx-rate.cache';
import { FxRateSnapshotEntity } from './fx-rate-snapshot.entity';
import { crossRate, FxRatesService } from './fx-rates.service';
import { ResolvedRates } from './fx.types';
import {
  FxProviderError,
  FxRateProvider,
  UsdRateTable,
} from './providers/fx-rate-provider';
import {
  STATIC_USD_RATES,
  StaticRateProvider,
} from './providers/static-rate.provider';

const LIVE_TABLE: UsdRateTable = {
  provider: 'test-live',
  rates: { USD: '1', EUR: '0.9', NGN: '1500', GHS: '15', XAF: '590.3613' },
  asOf: '2026-10-29T00:00:00.000Z',
  fetchedAt: '2026-10-29T00:05:00.000Z',
};

function build(options: {
  primary: FxRateProvider;
  cached?: ResolvedRates | null;
  snapshot?: Partial<FxRateSnapshotEntity> | null;
}) {
  const cache = {
    get: jest.fn().mockResolvedValue(options.cached ?? null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const snapshots = {
    insert: jest.fn().mockResolvedValue(undefined),
    find: jest
      .fn()
      .mockResolvedValue(options.snapshot ? [options.snapshot] : []),
  };
  const config = {
    fx: { cacheTtlSeconds: 300 },
  } as unknown as AppConfigService;

  const service = new FxRatesService(
    options.primary,
    new StaticRateProvider(),
    cache as unknown as FxRateCache,
    snapshots as unknown as Repository<FxRateSnapshotEntity>,
    config,
  );
  return { service, cache, snapshots };
}

const failing: FxRateProvider = {
  name: 'down',
  source: 'live',
  fetchUsdRates: () => Promise.reject(new FxProviderError('timeout')),
};
const healthy: FxRateProvider = {
  name: 'test-live',
  source: 'live',
  fetchUsdRates: () => Promise.resolve({ ...LIVE_TABLE }),
};

describe('FxRatesService', () => {
  it('serves from the Redis cache without calling the provider', async () => {
    const fetchUsdRates = jest.fn();
    const cached = { ...LIVE_TABLE, source: 'live', stale: false } as const;
    const { service } = build({
      primary: { name: 'p', source: 'live', fetchUsdRates },
      cached,
    });

    await expect(service.getRates()).resolves.toEqual(cached);
    expect(fetchUsdRates).not.toHaveBeenCalled();
  });

  it('fetches live rates on a miss, persists a snapshot and caches them', async () => {
    const { service, cache, snapshots } = build({ primary: healthy });

    const rates = await service.getRates();

    expect(rates).toMatchObject({ source: 'live', stale: false });
    expect(snapshots.insert).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(rates, 300);
  });

  it('labels rates with the source the primary provider declares', async () => {
    const { service } = build({ primary: new StaticRateProvider() });

    await expect(service.getRates()).resolves.toMatchObject({
      source: 'static',
      stale: false,
      rates: STATIC_USD_RATES,
    });
  });

  it('falls back to the last-known-good snapshot when the provider fails', async () => {
    const { service, cache } = build({
      primary: failing,
      snapshot: {
        provider: 'test-live',
        rates: LIVE_TABLE.rates,
        asOf: new Date(LIVE_TABLE.asOf),
        fetchedAt: new Date(LIVE_TABLE.fetchedAt),
      },
    });

    const rates = await service.getRates();

    expect(rates).toMatchObject({
      source: 'last-known-good',
      stale: true,
      rates: LIVE_TABLE.rates,
      asOf: LIVE_TABLE.asOf,
    });
    // fallbacks are cached briefly so the provider is retried soon
    expect(cache.set).toHaveBeenCalledWith(rates, 30);
  });

  it('falls back to the static table when nothing else is available', async () => {
    const { service } = build({ primary: failing, snapshot: null });

    const rates = await service.getRates();

    expect(rates).toMatchObject({
      source: 'static',
      stale: true,
      rates: STATIC_USD_RATES,
    });
  });

  it('collapses concurrent cache misses into a single provider call', async () => {
    const fetchUsdRates = jest.fn().mockResolvedValue({ ...LIVE_TABLE });
    const { service } = build({
      primary: { name: 'p', source: 'live', fetchUsdRates },
    });

    await Promise.all([
      service.getRates(),
      service.getRates(),
      service.getRates(),
    ]);

    expect(fetchUsdRates).toHaveBeenCalledTimes(1);
  });

  it('refreshFromProvider propagates provider errors so the job can retry', async () => {
    const { service } = build({ primary: failing });
    await expect(service.refreshFromProvider()).rejects.toThrow(
      FxProviderError,
    );
  });
});

describe('crossRate', () => {
  it('derives cross rates via USD and rounds to 12 dp', () => {
    expect(crossRate(LIVE_TABLE, Currency.USDx, Currency.cNGN).toFixed()).toBe(
      '1500',
    );
    expect(
      crossRate(LIVE_TABLE, Currency.cNGN, Currency.USDx).toFixed(12),
    ).toBe('0.000666666667');
    expect(
      crossRate(LIVE_TABLE, Currency.cNGN, Currency.cGHS).toFixed(12),
    ).toBe('0.010000000000');
  });

  it('returns exactly 1 for the same currency', () => {
    expect(crossRate(LIVE_TABLE, Currency.EURx, Currency.EURx).toFixed()).toBe(
      '1',
    );
  });
});

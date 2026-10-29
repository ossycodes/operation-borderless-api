import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Repository } from 'typeorm';
import {
  Currency,
  FIAT_PEG,
  SUPPORTED_CURRENCIES,
} from '../common/money/currency';
import { Dec, RATE_SCALE } from '../common/money/money';
import { AppConfigService } from '../config/app-config.service';
import { FxProviderKind } from '../config/env.validation';
import { FxRateCache } from './fx-rate.cache';
import { FxRateSnapshotEntity } from './fx-rate-snapshot.entity';
import { FxQuote, ResolvedRates } from './fx.types';
import { PRIMARY_FX_PROVIDER } from './providers/fx-rate-provider';
import type {
  FxRateProvider,
  UsdRateTable,
} from './providers/fx-rate-provider';
import { StaticRateProvider } from './providers/static-rate.provider';

/** How long a fallback table is cached before we try the provider again. */
const FALLBACK_CACHE_TTL_SECONDS = 30;

/**
 * Resolves FX rates through a chain of responsibility:
 *
 *   Redis cache → primary provider → last-known-good snapshot → static table
 *
 * Quotes are therefore always available, and every quote says where its
 * rate came from and how old it is.
 */
@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  /** Collapses concurrent cache misses in this process into one fetch. */
  private inflight: Promise<ResolvedRates> | null = null;

  constructor(
    @Inject(PRIMARY_FX_PROVIDER) private readonly primary: FxRateProvider,
    private readonly fallback: StaticRateProvider,
    private readonly cache: FxRateCache,
    @InjectRepository(FxRateSnapshotEntity)
    private readonly snapshots: Repository<FxRateSnapshotEntity>,
    private readonly config: AppConfigService,
  ) {}

  async getRates(): Promise<ResolvedRates> {
    const cached = await this.cache.get();
    if (cached) return cached;

    this.inflight ??= this.resolve().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /**
   * Fetches from the primary provider, persists and caches the result.
   * Throws on failure — used by the background refresh job so BullMQ can
   * retry with backoff.
   */
  async refreshFromProvider(): Promise<ResolvedRates> {
    const table = await this.primary.fetchUsdRates();
    await this.snapshots.insert({
      provider: table.provider,
      rates: table.rates,
      asOf: new Date(table.asOf),
    });
    const resolved: ResolvedRates = {
      ...table,
      source: this.isStaticMode() ? 'static' : 'live',
      stale: false,
    };
    await this.cache.set(resolved, this.config.fx.cacheTtlSeconds);
    return resolved;
  }

  async quote(from: Currency, to: Currency): Promise<FxQuote> {
    const rates = await this.getRates();
    return this.quoteFrom(rates, from, to);
  }

  /** Every ordered pair of distinct supported currencies. */
  async allQuotes(): Promise<{ rates: ResolvedRates; quotes: FxQuote[] }> {
    const rates = await this.getRates();
    const quotes: FxQuote[] = [];
    for (const from of SUPPORTED_CURRENCIES) {
      for (const to of SUPPORTED_CURRENCIES) {
        if (from !== to) quotes.push(this.quoteFrom(rates, from, to));
      }
    }
    return { rates, quotes };
  }

  quoteFrom(rates: ResolvedRates, from: Currency, to: Currency): FxQuote {
    return {
      from,
      to,
      rate: crossRate(rates, from, to),
      source: rates.source,
      provider: rates.provider,
      asOf: new Date(rates.asOf),
    };
  }

  private async resolve(): Promise<ResolvedRates> {
    try {
      return await this.refreshFromProvider();
    } catch (error) {
      this.logger.warn(
        `Primary FX provider "${this.primary.name}" failed: ${(error as Error).message}. Falling back.`,
      );
    }

    const lastKnownGood = await this.latestSnapshot();
    const resolved: ResolvedRates = lastKnownGood
      ? { ...lastKnownGood, source: 'last-known-good', stale: true }
      : {
          ...(await this.fallback.fetchUsdRates()),
          source: 'static',
          stale: true,
        };
    await this.cache.set(resolved, FALLBACK_CACHE_TTL_SECONDS);
    return resolved;
  }

  private async latestSnapshot(): Promise<UsdRateTable | null> {
    try {
      const [row] = await this.snapshots.find({
        order: { fetchedAt: 'DESC', id: 'DESC' },
        take: 1,
      });
      if (!row) return null;
      return {
        provider: row.provider,
        rates: row.rates,
        asOf: row.asOf.toISOString(),
        fetchedAt: row.fetchedAt.toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Could not load last-known-good FX snapshot: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private isStaticMode(): boolean {
    return this.config.fx.provider === FxProviderKind.Static;
  }
}

/**
 * Cross rate from USD-quoted rates: from→to = (to per USD) / (from per USD),
 * rounded half-even to the rate scale. The rounded rate is what gets applied
 * AND recorded, so every conversion is reproducible from its stored rate.
 */
export function crossRate(
  rates: Pick<UsdRateTable, 'rates'>,
  from: Currency,
  to: Currency,
): Decimal {
  if (from === to) return new Dec(1);
  const fromPerUsd = new Dec(rates.rates[FIAT_PEG[from]]);
  const toPerUsd = new Dec(rates.rates[FIAT_PEG[to]]);
  return toPerUsd
    .dividedBy(fromPerUsd)
    .toDecimalPlaces(RATE_SCALE, Decimal.ROUND_HALF_EVEN);
}

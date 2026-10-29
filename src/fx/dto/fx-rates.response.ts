import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '../../common/money/currency';
import { formatRate } from '../../common/money/money';
import type { FxQuote, RateSource, ResolvedRates } from '../fx.types';

const RATE_SOURCES: RateSource[] = ['live', 'last-known-good', 'static'];

export class FxPairRateDto {
  @ApiProperty({ enum: Currency, example: Currency.USDx })
  from: Currency;

  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  to: Currency;

  @ApiProperty({
    example: '1550.000000000000',
    description: 'Units of `to` received per 1 unit of `from`.',
  })
  rate: string;

  @ApiProperty({
    example: '2026-10-29T00:02:31.000Z',
    description: 'When this rate was last refreshed at the source.',
  })
  refreshedAt: string;

  static from(quote: FxQuote): FxPairRateDto {
    return {
      from: quote.from,
      to: quote.to,
      rate: formatRate(quote.rate),
      refreshedAt: quote.asOf.toISOString(),
    };
  }
}

export class FxRatesResponseDto {
  @ApiProperty({ enum: RATE_SOURCES, example: 'live' })
  source: RateSource;

  @ApiProperty({ example: 'open.er-api.com' })
  provider: string;

  @ApiProperty({
    description:
      'True when the live provider failed and a fallback table is being served.',
  })
  stale: boolean;

  @ApiProperty({ example: '2026-10-29T00:02:31.000Z' })
  refreshedAt: string;

  @ApiProperty({
    example: '2026-10-29T08:55:00.123Z',
    description: 'When the platform last fetched this table.',
  })
  fetchedAt: string;

  @ApiProperty({ type: [FxPairRateDto] })
  rates: FxPairRateDto[];

  static from(rates: ResolvedRates, quotes: FxQuote[]): FxRatesResponseDto {
    return {
      source: rates.source,
      provider: rates.provider,
      stale: rates.stale,
      refreshedAt: rates.asOf,
      fetchedAt: rates.fetchedAt,
      rates: quotes.map((q) => FxPairRateDto.from(q)),
    };
  }
}

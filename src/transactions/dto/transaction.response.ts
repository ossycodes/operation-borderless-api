import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '../../common/money/currency';
import type { RateSource } from '../../fx/fx.types';
import {
  TransactionEntity,
  TransactionStatus,
  TransactionType,
} from '../../ledger/entities/transaction.entity';

export class MoneyDto {
  @ApiProperty({ enum: Currency, example: Currency.USDx })
  currency: Currency;

  @ApiProperty({ example: '100.000000' })
  amount: string;
}

export class FxDetailsDto {
  @ApiProperty({
    example: '1550.000000000000',
    description: 'Units of destination currency per 1 unit of source currency.',
  })
  rate: string;

  @ApiProperty({ enum: ['live', 'last-known-good', 'static'] })
  source: RateSource;

  @ApiProperty({ example: 'open.er-api.com' })
  provider: string;

  @ApiProperty({ example: '2026-10-29T00:02:31.000Z' })
  refreshedAt: string;
}

export class TransactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ enum: TransactionStatus })
  status: TransactionStatus;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  sourceWalletId: string | null;

  @ApiProperty({ format: 'uuid' })
  destinationWalletId: string;

  @ApiProperty({
    type: MoneyDto,
    nullable: true,
    description: 'What left the source wallet (null for deposits).',
  })
  source: MoneyDto | null;

  @ApiProperty({
    type: MoneyDto,
    description: 'What arrived in the destination wallet.',
  })
  destination: MoneyDto;

  @ApiProperty({
    type: FxDetailsDto,
    nullable: true,
    description: 'Rate applied, when a currency conversion happened.',
  })
  fx: FxDetailsDto | null;

  @ApiProperty({ example: '2026-10-29T09:30:00.000Z' })
  createdAt: string;

  static from(tx: TransactionEntity): TransactionResponseDto {
    return {
      id: tx.id,
      type: tx.type,
      status: tx.status,
      sourceWalletId: tx.sourceWalletId,
      destinationWalletId: tx.destinationWalletId,
      source:
        tx.sourceCurrency && tx.sourceAmount
          ? { currency: tx.sourceCurrency, amount: tx.sourceAmount }
          : null,
      destination: {
        currency: tx.destinationCurrency,
        amount: tx.destinationAmount,
      },
      fx:
        tx.fxRate && tx.fxRateSource && tx.fxRateProvider && tx.fxRateAsOf
          ? {
              rate: tx.fxRate,
              source: tx.fxRateSource,
              provider: tx.fxRateProvider,
              refreshedAt: tx.fxRateAsOf.toISOString(),
            }
          : null,
      createdAt: tx.createdAt.toISOString(),
    };
  }
}

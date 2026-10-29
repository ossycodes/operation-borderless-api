import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '../../common/money/currency';
import type { RateSource } from '../../fx/fx.types';
import type { WalletView, WalletBalancesView } from '../wallets.service';

export class BalanceDto {
  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  currency: Currency;

  @ApiProperty({ example: '150000.000000' })
  amount: string;

  @ApiProperty({
    example: '96.774193',
    description: 'Value of this balance in USD at the current rate.',
  })
  usdValue: string;
}

export class WalletBalancesResponseDto {
  @ApiProperty({ format: 'uuid' })
  walletId: string;

  @ApiProperty({ type: [BalanceDto] })
  balances: BalanceDto[];

  @ApiProperty({
    example: '196.77',
    description: 'Sum of all balances in USD, rounded to cents.',
  })
  totalUsd: string;

  @ApiProperty({ enum: ['live', 'last-known-good', 'static'] })
  rateSource: RateSource;

  @ApiProperty({ example: '2026-10-29T00:02:31.000Z' })
  ratesRefreshedAt: string;

  static from(view: WalletBalancesView): WalletBalancesResponseDto {
    return {
      walletId: view.walletId,
      balances: view.balances.map((b) => ({
        currency: b.money.currency,
        amount: b.money.toString(),
        usdValue: b.usdValue.toString(),
      })),
      totalUsd: view.totalUsd.toFixed(2),
      rateSource: view.rateSource,
      ratesRefreshedAt: view.ratesAsOf,
    };
  }
}

export class WalletResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ nullable: true, type: String, example: 'ada@example.com' })
  email: string | null;

  @ApiProperty({ nullable: true, type: String, example: '+2348012345678' })
  phoneNumber: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: WalletBalancesResponseDto })
  portfolio: WalletBalancesResponseDto;

  static from(view: WalletView): WalletResponseDto {
    return {
      id: view.wallet.id,
      email: view.wallet.email,
      phoneNumber: view.wallet.phoneNumber,
      createdAt: view.wallet.createdAt.toISOString(),
      portfolio: WalletBalancesResponseDto.from(view.portfolio),
    };
  }
}

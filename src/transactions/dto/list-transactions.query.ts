import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Currency } from '../../common/money/currency';

/** Transaction kinds as seen from one wallet. */
export enum WalletTransactionKind {
  Deposit = 'deposit',
  Swap = 'swap',
  /** Both directions. */
  Transfer = 'transfer',
  TransferIn = 'transfer_in',
  TransferOut = 'transfer_out',
}

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ enum: WalletTransactionKind })
  @IsOptional()
  @IsEnum(WalletTransactionKind)
  type?: WalletTransactionKind;

  @ApiPropertyOptional({
    enum: Currency,
    description: 'Only transactions that moved this currency in the wallet',
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Opaque cursor from the previous page (`pageInfo.nextCursor`)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

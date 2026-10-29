import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Currency } from '../../common/money/currency';
import { IsPositiveAmount } from '../../common/money/is-amount.decorator';

export class TransferDto {
  @ApiProperty({ format: 'uuid', description: 'Receiving wallet' })
  @IsUUID()
  destinationWalletId: string;

  @ApiProperty({
    enum: Currency,
    example: Currency.USDx,
    description: 'Currency debited from the sender',
  })
  @IsEnum(Currency)
  sourceCurrency: Currency;

  @ApiPropertyOptional({
    enum: Currency,
    example: Currency.cNGN,
    description:
      'Currency credited to the receiver. Defaults to sourceCurrency; when it ' +
      'differs, the amount is converted at the current FX rate.',
  })
  @IsOptional()
  @IsEnum(Currency)
  destinationCurrency?: Currency;

  /** Amount of `sourceCurrency` to send. */
  @IsPositiveAmount()
  amount: string;
}

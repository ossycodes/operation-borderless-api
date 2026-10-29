import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Currency } from '../../common/money/currency';
import { IsPositiveAmount } from '../../common/money/is-amount.decorator';

export class SwapDto {
  @ApiProperty({ enum: Currency, example: Currency.USDx })
  @IsEnum(Currency)
  fromCurrency: Currency;

  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  @IsEnum(Currency)
  toCurrency: Currency;

  /** Amount of `fromCurrency` to sell. */
  @IsPositiveAmount()
  amount: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Currency } from '../../common/money/currency';
import { IsPositiveAmount } from '../../common/money/is-amount.decorator';

export class DepositDto {
  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  @IsEnum(Currency)
  currency: Currency;

  @IsPositiveAmount()
  amount: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Currency } from '../../common/money/currency';

export class FxRatesQueryDto {
  @ApiPropertyOptional({
    enum: Currency,
    description: 'Only pairs from this currency',
  })
  @IsOptional()
  @IsEnum(Currency)
  from?: Currency;

  @ApiPropertyOptional({
    enum: Currency,
    description: 'Only pairs to this currency',
  })
  @IsOptional()
  @IsEnum(Currency)
  to?: Currency;
}

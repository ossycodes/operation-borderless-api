import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FxRatesQueryDto } from './dto/fx-rates.query';
import { FxRatesResponseDto } from './dto/fx-rates.response';
import { FxRatesService } from './fx-rates.service';

@ApiTags('FX rates')
@Controller('fx')
export class FxController {
  constructor(private readonly fxRates: FxRatesService) {}

  @Get('rates')
  @ApiOperation({
    summary: 'Current conversion rates between all supported stablecoins',
    description:
      'Returns every ordered currency pair with the time the rate was last ' +
      'refreshed and the source it came from (live / last-known-good / static).',
  })
  @ApiOkResponse({ type: FxRatesResponseDto })
  async getRates(@Query() query: FxRatesQueryDto): Promise<FxRatesResponseDto> {
    const { rates, quotes } = await this.fxRates.allQuotes();
    const filtered = quotes.filter(
      (q) =>
        (!query.from || q.from === query.from) &&
        (!query.to || q.to === query.to),
    );
    return FxRatesResponseDto.from(rates, filtered);
  }
}

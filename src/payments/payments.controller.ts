import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiIdempotent,
  IdempotencyKey,
  REPLAYED_HEADER,
} from '../idempotency/idempotency-key.decorator';
import type { IdempotentResult } from '../idempotency/idempotency.service';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { DepositsService } from './deposits.service';
import { DepositDto } from './dto/deposit.dto';
import { SwapDto } from './dto/swap.dto';
import { SwapsService } from './swaps.service';

@ApiTags('Payments')
@Controller('wallets/:walletId')
export class PaymentsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly swaps: SwapsService,
  ) {}

  @Post('deposits')
  @ApiOperation({
    summary: 'Deposit (simulated) funds in any supported stablecoin',
    description:
      'Credits the wallet immediately and records a DEPOSIT transaction.',
  })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  async deposit(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Body() dto: DepositDto,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return respond(
      res,
      await this.deposits.deposit(walletId, dto, idempotencyKey),
    );
  }

  @Post('swaps')
  @ApiOperation({
    summary: 'Swap one stablecoin for another inside the wallet',
    description:
      'Converts at the current FX rate (12 dp, half-even), rounding the bought ' +
      'amount down to 6 dp. Rejected with 422 INSUFFICIENT_FUNDS if the source ' +
      'balance would go negative. The rate applied is recorded on the transaction.',
  })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  async swap(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Body() dto: SwapDto,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return respond(res, await this.swaps.swap(walletId, dto, idempotencyKey));
  }
}

/** Applies the stored status code and marks idempotent replays. */
function respond<T>(res: Response, result: IdempotentResult<T>): T {
  res.status(result.statusCode);
  res.setHeader(REPLAYED_HEADER, String(result.replayed));
  return result.body;
}

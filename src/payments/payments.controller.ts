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

@ApiTags('Payments')
@Controller('wallets/:walletId')
export class PaymentsController {
  constructor(private readonly deposits: DepositsService) {}

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
}

/** Applies the stored status code and marks idempotent replays. */
function respond<T>(res: Response, result: IdempotentResult<T>): T {
  res.status(result.statusCode);
  res.setHeader(REPLAYED_HEADER, String(result.replayed));
  return result.body;
}

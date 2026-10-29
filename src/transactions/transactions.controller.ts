import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ListTransactionsQueryDto } from './dto/list-transactions.query';
import { TransactionPageDto } from './dto/transaction-page.response';
import { TransactionResponseDto } from './dto/transaction.response';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@Controller()
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get('wallets/:walletId/transactions')
  @ApiOperation({
    summary: "List a wallet's transactions, newest first",
    description:
      'Deposits, swaps and transfers sent and received. Filter by `type` and ' +
      '`currency`; paginate with `limit` and the opaque `cursor`.',
  })
  @ApiOkResponse({ type: TransactionPageDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  list(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionPageDto> {
    return this.transactions.listForWallet(walletId, query);
  }

  @Get('transactions/:transactionId')
  @ApiOperation({ summary: 'Fetch a single transaction by id' })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'TRANSACTION_NOT_FOUND' })
  get(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ): Promise<TransactionResponseDto> {
    return this.transactions.getById(transactionId);
  }
}

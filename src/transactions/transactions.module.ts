import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsModule } from '../wallets/wallets.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/** Read side: transaction history and lookups. */
@Module({
  imports: [LedgerModule, WalletsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}

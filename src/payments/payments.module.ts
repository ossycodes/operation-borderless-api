import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DepositsService } from './deposits.service';
import { PaymentsController } from './payments.controller';

/** Use cases that move money. Each one is idempotent and posts via the ledger. */
@Module({
  imports: [LedgerModule, IdempotencyModule],
  controllers: [PaymentsController],
  providers: [DepositsService],
})
export class PaymentsModule {}

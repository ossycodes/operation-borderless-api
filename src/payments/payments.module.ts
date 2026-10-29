import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DepositsService } from './deposits.service';
import { PaymentsController } from './payments.controller';
import { SwapsService } from './swaps.service';

/** Use cases that move money. Each one is idempotent and posts via the ledger. */
@Module({
  imports: [LedgerModule, IdempotencyModule, FxModule],
  controllers: [PaymentsController],
  providers: [DepositsService, SwapsService],
})
export class PaymentsModule {}

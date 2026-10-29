import { Injectable } from '@nestjs/common';
import { Money } from '../common/money/money';
import type { IdempotentResult } from '../idempotency/idempotency.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { DepositDto } from './dto/deposit.dto';
import { PaymentProcessor } from './payment-processor';

/** Simulated on-ramp: credits a wallet with freshly "minted" stablecoins. */
@Injectable()
export class DepositsService {
  constructor(private readonly payments: PaymentProcessor) {}

  deposit(
    walletId: string,
    dto: DepositDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    const amount = Money.parse(dto.currency, dto.amount);

    return this.payments.process(
      {
        scope: `deposit:${walletId}`,
        key: idempotencyKey,
        request: { walletId, currency: dto.currency, amount: dto.amount },
      },
      () =>
        Promise.resolve({
          type: TransactionType.Deposit,
          sourceWalletId: null,
          destinationWalletId: walletId,
          source: null,
          destination: amount,
          fx: null,
          legs: [{ walletId, delta: amount }],
        }),
    );
  }
}

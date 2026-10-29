import { HttpStatus, Injectable } from '@nestjs/common';
import { Money } from '../common/money/money';
import {
  IdempotencyService,
  IdempotentResult,
} from '../idempotency/idempotency.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { DepositDto } from './dto/deposit.dto';

/** Simulated on-ramp: credits a wallet with freshly "minted" stablecoins. */
@Injectable()
export class DepositsService {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly ledger: LedgerService,
  ) {}

  deposit(
    walletId: string,
    dto: DepositDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    const amount = Money.parse(dto.currency, dto.amount);

    return this.idempotency.execute(
      {
        scope: `deposit:${walletId}`,
        key: idempotencyKey,
        request: { walletId, currency: dto.currency, amount: dto.amount },
      },
      async (manager) => {
        const tx = await this.ledger.post(manager, {
          type: TransactionType.Deposit,
          sourceWalletId: null,
          destinationWalletId: walletId,
          source: null,
          destination: amount,
          fx: null,
          idempotencyKey,
          legs: [{ walletId, delta: amount }],
        });
        return {
          statusCode: HttpStatus.CREATED,
          body: TransactionResponseDto.from(tx),
          transactionId: tx.id,
        };
      },
    );
  }
}

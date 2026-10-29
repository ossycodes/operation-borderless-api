import { HttpStatus, Injectable } from '@nestjs/common';
import {
  IdempotencyContext,
  IdempotencyService,
  IdempotentResult,
} from '../idempotency/idempotency.service';
import { LedgerService, PostingRequest } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';

/** What a use case decides to post; the processor supplies the key. */
export type PaymentPlan = Omit<PostingRequest, 'idempotencyKey'>;

/**
 * Template shared by every money-moving use case. A use case only describes
 * WHAT to post (its plan); the processor owns HOW it is executed:
 *
 *   replay check → plan (outside any DB transaction) → claim key + post
 *
 * Planning runs only for a first-time key, so a retried request replays the
 * stored response without re-quoting FX or re-validating against new rates.
 */
@Injectable()
export class PaymentProcessor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly ledger: LedgerService,
  ) {}

  process(
    context: IdempotencyContext,
    plan: () => Promise<PaymentPlan>,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    return this.idempotency.execute(context, {
      prepare: plan,
      run: async (manager, posting) => {
        const tx = await this.ledger.post(manager, {
          ...posting,
          idempotencyKey: context.key,
        });
        return {
          statusCode: HttpStatus.CREATED,
          body: TransactionResponseDto.from(tx),
          transactionId: tx.id,
        };
      },
    });
  }
}

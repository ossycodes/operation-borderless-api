import { HttpStatus, Injectable } from '@nestjs/common';
import { Money } from '../common/money/money';
import { FxRatesService } from '../fx/fx-rates.service';
import type { FxQuote } from '../fx/fx.types';
import {
  IdempotencyService,
  IdempotentResult,
} from '../idempotency/idempotency.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { TransferDto } from './dto/transfer.dto';
import { AmountTooSmallError, SelfTransferError } from './payments.errors';

/**
 * Wallet-to-wallet transfer. When the currencies differ the amount is
 * converted at the current rate, and sender, receiver, both amounts, the
 * applied rate and the timestamp are recorded on one transaction.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly ledger: LedgerService,
    private readonly fxRates: FxRatesService,
  ) {}

  async transfer(
    sourceWalletId: string,
    dto: TransferDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    if (sourceWalletId === dto.destinationWalletId) {
      throw new SelfTransferError();
    }
    const destinationCurrency = dto.destinationCurrency ?? dto.sourceCurrency;
    const sent = Money.parse(dto.sourceCurrency, dto.amount);

    let quote: FxQuote | null = null;
    let received = sent;
    if (destinationCurrency !== dto.sourceCurrency) {
      quote = await this.fxRates.quote(dto.sourceCurrency, destinationCurrency);
      received = sent.convert(destinationCurrency, quote.rate);
      if (!received.isPositive()) {
        throw new AmountTooSmallError({
          amount: dto.amount,
          from: dto.sourceCurrency,
          to: destinationCurrency,
        });
      }
    }

    return this.idempotency.execute(
      {
        scope: `transfer:${sourceWalletId}`,
        key: idempotencyKey,
        request: { sourceWalletId, ...dto, destinationCurrency },
      },
      async (manager) => {
        const tx = await this.ledger.post(manager, {
          type: TransactionType.Transfer,
          sourceWalletId,
          destinationWalletId: dto.destinationWalletId,
          source: sent,
          destination: received,
          fx: quote,
          idempotencyKey,
          legs: [
            { walletId: sourceWalletId, delta: sent.negate() },
            { walletId: dto.destinationWalletId, delta: received },
          ],
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

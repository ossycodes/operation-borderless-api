import { Injectable } from '@nestjs/common';
import { Currency } from '../common/money/currency';
import { Money } from '../common/money/money';
import { FxRatesService } from '../fx/fx-rates.service';
import type { FxQuote } from '../fx/fx.types';
import type { IdempotentResult } from '../idempotency/idempotency.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { TransferDto } from './dto/transfer.dto';
import { PaymentProcessor } from './payment-processor';
import { AmountTooSmallError, SelfTransferError } from './payments.errors';

/**
 * Wallet-to-wallet transfer. When the currencies differ the amount is
 * converted at the current rate, and sender, receiver, both amounts, the
 * applied rate and the timestamp are recorded on one transaction.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly payments: PaymentProcessor,
    private readonly fxRates: FxRatesService,
  ) {}

  transfer(
    sourceWalletId: string,
    dto: TransferDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    if (sourceWalletId === dto.destinationWalletId) {
      throw new SelfTransferError();
    }
    const destinationCurrency = dto.destinationCurrency ?? dto.sourceCurrency;
    const sent = Money.parse(dto.sourceCurrency, dto.amount);

    return this.payments.process(
      {
        scope: `transfer:${sourceWalletId}`,
        key: idempotencyKey,
        request: { sourceWalletId, ...dto, destinationCurrency },
      },
      async () => {
        const { received, quote } = await this.convert(
          sent,
          destinationCurrency,
        );
        return {
          type: TransactionType.Transfer,
          sourceWalletId,
          destinationWalletId: dto.destinationWalletId,
          source: sent,
          destination: received,
          fx: quote,
          legs: [
            { walletId: sourceWalletId, delta: sent.negate() },
            { walletId: dto.destinationWalletId, delta: received },
          ],
        };
      },
    );
  }

  /** Same-currency transfers move the amount as-is, with no FX quote. */
  private async convert(
    sent: Money,
    target: Currency,
  ): Promise<{ received: Money; quote: FxQuote | null }> {
    if (target === sent.currency) return { received: sent, quote: null };

    const quote = await this.fxRates.quote(sent.currency, target);
    const received = sent.convert(target, quote.rate);
    if (!received.isPositive()) {
      throw new AmountTooSmallError({
        amount: sent.toString(),
        from: sent.currency,
        to: target,
      });
    }
    return { received, quote };
  }
}

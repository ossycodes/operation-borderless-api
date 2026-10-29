import { Injectable } from '@nestjs/common';
import { Money } from '../common/money/money';
import { FxRatesService } from '../fx/fx-rates.service';
import type { IdempotentResult } from '../idempotency/idempotency.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { SwapDto } from './dto/swap.dto';
import { PaymentProcessor } from './payment-processor';
import { AmountTooSmallError, SameCurrencySwapError } from './payments.errors';

/** Converts one stablecoin into another inside the same wallet. */
@Injectable()
export class SwapsService {
  constructor(
    private readonly payments: PaymentProcessor,
    private readonly fxRates: FxRatesService,
  ) {}

  swap(
    walletId: string,
    dto: SwapDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new SameCurrencySwapError(dto.fromCurrency);
    }
    const sold = Money.parse(dto.fromCurrency, dto.amount);

    return this.payments.process(
      {
        scope: `swap:${walletId}`,
        key: idempotencyKey,
        request: { walletId, ...dto },
      },
      async () => {
        // Quoted before the DB transaction opens (no network I/O while
        // holding row locks). The rate is pinned and recorded with the
        // transaction.
        const quote = await this.fxRates.quote(
          dto.fromCurrency,
          dto.toCurrency,
        );
        const bought = sold.convert(dto.toCurrency, quote.rate);
        if (!bought.isPositive()) {
          throw new AmountTooSmallError({
            amount: sold.toString(),
            from: dto.fromCurrency,
            to: dto.toCurrency,
          });
        }
        return {
          type: TransactionType.Swap,
          sourceWalletId: walletId,
          destinationWalletId: walletId,
          source: sold,
          destination: bought,
          fx: quote,
          legs: [
            { walletId, delta: sold.negate() },
            { walletId, delta: bought },
          ],
        };
      },
    );
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { Money } from '../common/money/money';
import { FxRatesService } from '../fx/fx-rates.service';
import {
  IdempotencyService,
  IdempotentResult,
} from '../idempotency/idempotency.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction.response';
import { SwapDto } from './dto/swap.dto';
import { AmountTooSmallError, SameCurrencySwapError } from './payments.errors';

/** Converts one stablecoin into another inside the same wallet. */
@Injectable()
export class SwapsService {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly ledger: LedgerService,
    private readonly fxRates: FxRatesService,
  ) {}

  async swap(
    walletId: string,
    dto: SwapDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new SameCurrencySwapError(dto.fromCurrency);
    }
    const sold = Money.parse(dto.fromCurrency, dto.amount);

    // Quote before opening the DB transaction: no network I/O while holding
    // row locks. The rate is pinned and recorded with the transaction.
    const quote = await this.fxRates.quote(dto.fromCurrency, dto.toCurrency);
    const bought = sold.convert(dto.toCurrency, quote.rate);
    if (!bought.isPositive()) {
      throw new AmountTooSmallError({
        amount: dto.amount,
        from: dto.fromCurrency,
        to: dto.toCurrency,
      });
    }

    return this.idempotency.execute(
      {
        scope: `swap:${walletId}`,
        key: idempotencyKey,
        request: { walletId, ...dto },
      },
      async (manager) => {
        const tx = await this.ledger.post(manager, {
          type: TransactionType.Swap,
          sourceWalletId: walletId,
          destinationWalletId: walletId,
          source: sold,
          destination: bought,
          fx: quote,
          idempotencyKey,
          legs: [
            { walletId, delta: sold.negate() },
            { walletId, delta: bought },
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

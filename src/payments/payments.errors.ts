import { BusinessRuleError } from '../common/errors/domain.error';
import { Currency } from '../common/money/currency';

export class SameCurrencySwapError extends BusinessRuleError {
  override readonly code = 'SAME_CURRENCY_SWAP';

  constructor(currency: Currency) {
    super('fromCurrency and toCurrency must be different', { currency });
  }
}

export class AmountTooSmallError extends BusinessRuleError {
  override readonly code = 'AMOUNT_TOO_SMALL';

  constructor(details: { amount: string; from: Currency; to: Currency }) {
    super(
      `${details.amount} ${details.from} converts to less than the smallest ${details.to} unit`,
      details,
    );
  }
}

export class SelfTransferError extends BusinessRuleError {
  override readonly code = 'SELF_TRANSFER';

  constructor() {
    super(
      'Source and destination wallets must differ; use a swap to convert within a wallet',
    );
  }
}

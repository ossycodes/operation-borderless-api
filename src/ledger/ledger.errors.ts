import { BusinessRuleError } from '../common/errors/domain.error';
import { Currency } from '../common/money/currency';

export class InsufficientFundsError extends BusinessRuleError {
  override readonly code = 'INSUFFICIENT_FUNDS';

  constructor(details: {
    walletId: string;
    currency: Currency;
    available: string;
    requested: string;
  }) {
    super(
      `Insufficient ${details.currency} balance: available ${details.available}, requested ${details.requested}`,
      details,
    );
  }
}

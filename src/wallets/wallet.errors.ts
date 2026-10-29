import { ConflictError, NotFoundError } from '../common/errors/domain.error';

export class WalletNotFoundError extends NotFoundError {
  override readonly code = 'WALLET_NOT_FOUND';

  constructor(walletId: string) {
    super(`Wallet ${walletId} was not found`, { walletId });
  }
}

export class WalletAlreadyExistsError extends ConflictError {
  override readonly code = 'WALLET_ALREADY_EXISTS';

  constructor(field: 'email' | 'phoneNumber') {
    super(`A wallet already exists for this ${field}`, { field });
  }
}

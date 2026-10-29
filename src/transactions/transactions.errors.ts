import { HttpStatus } from '@nestjs/common';
import { DomainError, NotFoundError } from '../common/errors/domain.error';

export class TransactionNotFoundError extends NotFoundError {
  override readonly code = 'TRANSACTION_NOT_FOUND';

  constructor(transactionId: string) {
    super(`Transaction ${transactionId} was not found`, { transactionId });
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';
  readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor() {
    super('cursor is malformed; use pageInfo.nextCursor from a previous page');
  }
}

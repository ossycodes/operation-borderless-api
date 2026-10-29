import { HttpStatus } from '@nestjs/common';

/**
 * Base class for expected business-rule failures. Services throw these;
 * the global exception filter maps them to HTTP. Keeps the domain free of
 * HTTP concerns while still giving clients a stable, machine-readable code.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: HttpStatus;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}

export class ConflictError extends DomainError {
  readonly code: string = 'CONFLICT';
  readonly httpStatus = HttpStatus.CONFLICT;
}

export class BusinessRuleError extends DomainError {
  readonly code: string = 'BUSINESS_RULE_VIOLATION';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}

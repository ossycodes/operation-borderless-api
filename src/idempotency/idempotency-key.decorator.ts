import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { DomainError } from '../common/errors/domain.error';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'Idempotent-Replayed';

// Printable ASCII, no spaces — UUIDs, ULIDs, client-generated tokens, etc.
const VALID_KEY = /^[\x21-\x7E]{8,255}$/;

export class IdempotencyKeyRequiredError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REQUIRED';
  readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor() {
    super(
      'An Idempotency-Key header (8-255 printable characters, e.g. a UUID) is required',
    );
  }
}

/** Extracts and validates the `Idempotency-Key` request header. */
export const IdempotencyKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const value = request.headers[IDEMPOTENCY_HEADER];
    if (typeof value !== 'string' || !VALID_KEY.test(value)) {
      throw new IdempotencyKeyRequiredError();
    }
    return value;
  },
);

/** OpenAPI documentation for idempotent endpoints. */
export function ApiIdempotent(): MethodDecorator {
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Unique key per logical operation (e.g. a UUID v4). Retrying with the ' +
        'same key and payload returns the original response without moving ' +
        'money again; reusing it with a different payload returns 422.',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'IDEMPOTENCY_KEY_REUSED, INSUFFICIENT_FUNDS or another business rule violation',
    }),
  );
}

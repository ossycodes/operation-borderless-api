import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, ValidateBy, ValidationOptions } from 'class-validator';
import { AMOUNT_SCALE, Dec, MAX_OPERATION_AMOUNT } from './money';

const PATTERN = new RegExp(`^(0|[1-9]\\d{0,25})(\\.\\d{1,${AMOUNT_SCALE}})?$`);

/**
 * Validates a strictly positive decimal amount sent as a string. Amounts are
 * strings on the wire so no client ever has to round-trip through a float.
 */
export function IsPositiveAmount(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      type: String,
      example: '150.50',
      pattern: PATTERN.source,
      description: `Positive decimal string, up to ${AMOUNT_SCALE} decimal places and at most ${MAX_OPERATION_AMOUNT}.`,
    }),
    IsString(),
    ValidateBy(
      {
        name: 'isPositiveAmount',
        validator: {
          validate: (value: unknown): boolean => {
            if (typeof value !== 'string' || !PATTERN.test(value)) return false;
            const amount = new Dec(value);
            return amount.gt(0) && amount.lte(MAX_OPERATION_AMOUNT);
          },
          defaultMessage: (args) =>
            `${args?.property ?? 'amount'} must be a positive decimal string with at most ${AMOUNT_SCALE} decimal places and no greater than ${MAX_OPERATION_AMOUNT}`,
        },
      },
      validationOptions,
    ),
  );
}

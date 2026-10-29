import { QueryFailedError } from 'typeorm';

/** Postgres SQLSTATE codes we react to. */
export const PgErrorCode = {
  UniqueViolation: '23505',
  CheckViolation: '23514',
} as const;

type PgDriverError = { code?: string; constraint?: string };

export function isPgError(
  error: unknown,
  code: (typeof PgErrorCode)[keyof typeof PgErrorCode],
  constraint?: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as PgDriverError;
  if (driverError.code !== code) return false;
  return constraint === undefined || driverError.constraint === constraint;
}

import type { LogLevel } from '@nestjs/common';

/** Nest log levels, most severe first. */
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const satisfies readonly LogLevel[];

/** `LOG_LEVEL=warn` enables fatal, error and warn; everything below is muted. */
export function enabledLogLevels(threshold: LogLevel): LogLevel[] {
  return LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(threshold) + 1);
}

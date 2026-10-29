import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from './request-id.middleware';

const logger = new Logger('HTTP');

/** Container health probes would otherwise drown the access log. */
const UNLOGGED_PATHS = new Set(['/health']);

/**
 * One access-log line per request, tagged with its correlation id so a
 * client-reported `x-request-id` leads straight to the server-side trace.
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (UNLOGGED_PATHS.has(req.path)) return next();

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const line =
      `${req.method} ${req.originalUrl} ${res.statusCode} ` +
      `${elapsedMs.toFixed(1)}ms rid=${String(req.headers[REQUEST_ID_HEADER])}`;
    if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}

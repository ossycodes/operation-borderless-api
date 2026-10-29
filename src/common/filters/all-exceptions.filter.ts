import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain.error';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  statusCode: number;
  path: string;
  timestamp: string;
  requestId?: string;
}

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/** Single, consistent error envelope for every failure the API returns. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { statusCode, code, message, details } = this.describe(exception);
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorEnvelope = {
      error: { code, message, ...(details !== undefined && { details }) },
      statusCode,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: request.headers[REQUEST_ID_HEADER] as string | undefined,
    };
    response.status(statusCode).json(body);
  }

  private describe(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof DomainError) {
      return {
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const raw =
        typeof res === 'object' && res !== null
          ? (res as { message?: unknown }).message
          : res;
      // ValidationPipe returns an array of messages: surface them as details.
      const isList = Array.isArray(raw);
      return {
        statusCode,
        code: STATUS_CODES[statusCode] ?? `HTTP_${statusCode}`,
        message: isList
          ? 'Request validation failed'
          : typeof raw === 'string'
            ? raw
            : exception.message,
        ...(isList && { details: raw }),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }
}

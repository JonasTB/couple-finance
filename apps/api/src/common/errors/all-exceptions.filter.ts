import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiErrorEnvelope, ErrorCode } from '@couple-finance/shared';
import { type Request, type Response } from 'express';
import { AppException } from './app.exception';

const TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/**
 * Named throttlers emit `Retry-After-<name>` headers; clients expect the standard
 * `Retry-After` (RFC 9110), so expose the longest wait under the standard name.
 */
function setStandardRetryAfter(response: Response): void {
  const waits = response
    .getHeaderNames()
    .filter((name) => name.startsWith('retry-after-'))
    .map((name) => Number(response.getHeader(name)))
    .filter((seconds) => Number.isFinite(seconds));
  if (waits.length > 0) {
    response.setHeader('Retry-After', String(Math.max(...waits)));
  }
}

/**
 * Converts every error into the single envelope `{ error: { code, message, details?, requestId } }`.
 * Unknown errors become a generic 500: no stack traces, SQL or internals reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const { status, body } = this.toEnvelope(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId },
        exception instanceof Error ? exception.message : 'Unhandled non-error exception',
      );
    }

    if (status === TOO_MANY_REQUESTS) {
      setStandardRetryAfter(response);
    }
    response.status(status).json(body);
  }

  private toEnvelope(
    exception: unknown,
    requestId: string | undefined,
  ): { status: number; body: ApiErrorEnvelope } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details ? { details: exception.details } : {}),
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ??
        (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED);
      const message = status >= 500 ? 'An unexpected error occurred.' : exception.message;
      return {
        status,
        body: { error: { code, message, ...(requestId ? { requestId } : {}) } },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
          ...(requestId ? { requestId } : {}),
        },
      },
    };
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@couple-finance/shared';

/**
 * Domain/application error with a stable machine code (API_CONVENTIONS.md §6).
 * Throw this instead of raw Nest HTTP exceptions so clients always get a `code`.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }
}

export interface FieldViolation {
  field: string;
  constraints: string[];
}

export function validationFailed(violations: FieldViolation[]): AppException {
  return new AppException(
    ErrorCode.VALIDATION_FAILED,
    'Request validation failed.',
    HttpStatus.BAD_REQUEST,
    { fields: violations },
  );
}

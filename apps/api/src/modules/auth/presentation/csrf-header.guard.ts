import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { AUTH_CSRF_HEADER, AUTH_CSRF_HEADER_VALUE, ErrorCode } from '@couple-finance/shared';
import { type Request } from 'express';
import { AppException } from '../../../common/errors/app.exception';

/**
 * Cookie-authenticated endpoints require a custom header. Browsers cannot send it cross-site
 * without a CORS preflight, which the origin allow-list rejects (ADR-004).
 */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header(AUTH_CSRF_HEADER) !== AUTH_CSRF_HEADER_VALUE) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        `Missing ${AUTH_CSRF_HEADER} header.`,
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}

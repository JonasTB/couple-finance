import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@couple-finance/shared';
import {
  AppException,
  type FieldViolation,
  validationFailed,
} from '../../../common/errors/app.exception';

/** Cross-household access is reported as "not found" to avoid leaking existence (NFR-02). */
export const householdNotFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Household not found.', HttpStatus.NOT_FOUND);

export const notFound = (what: string): AppException =>
  new AppException(ErrorCode.NOT_FOUND, `${what} not found.`, HttpStatus.NOT_FOUND);

export const forbidden = (): AppException =>
  new AppException(
    ErrorCode.FORBIDDEN,
    'Only the household owner can do this.',
    HttpStatus.FORBIDDEN,
  );

export const versionConflict = (): AppException =>
  new AppException(
    ErrorCode.VERSION_CONFLICT,
    'The household changed since it was loaded. Reload and try again.',
    HttpStatus.CONFLICT,
  );

export const householdFull = (): AppException =>
  new AppException(
    ErrorCode.HOUSEHOLD_FULL,
    'The household already has the maximum number of members or pending invitations.',
    HttpStatus.CONFLICT,
  );

export const alreadyMember = (): AppException =>
  new AppException(
    ErrorCode.ALREADY_MEMBER,
    'Already a member of this household.',
    HttpStatus.CONFLICT,
  );

export const invitationInvalid = (): AppException =>
  new AppException(
    ErrorCode.INVITATION_INVALID,
    'This invitation is invalid, expired or was already used.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

export const invitationEmailMismatch = (): AppException =>
  new AppException(
    ErrorCode.INVITATION_EMAIL_MISMATCH,
    'This invitation was sent to a different email address.',
    HttpStatus.FORBIDDEN,
  );

export const ownershipTransferRequired = (): AppException =>
  new AppException(
    ErrorCode.OWNERSHIP_TRANSFER_REQUIRED,
    'Transfer ownership to another member before leaving.',
    HttpStatus.CONFLICT,
  );

export const invalidField = (field: string, ...constraints: string[]): AppException =>
  validationFailed([{ field, constraints } satisfies FieldViolation]);

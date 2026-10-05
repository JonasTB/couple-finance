import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@couple-finance/shared';
import { AppException } from '../errors/app.exception';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids in paths are "not found", consistent with cross-household access. */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Resource not found.', HttpStatus.NOT_FOUND);
    }
    return value;
  }
}

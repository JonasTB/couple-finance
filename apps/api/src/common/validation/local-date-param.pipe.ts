import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@couple-finance/shared';
import { AppException } from '../errors/app.exception';
import { isLocalDate } from '../time/local-date';

/** A `YYYY-MM-DD` path segment (e.g. an occurrence date); anything else is "not found". */
@Injectable()
export class LocalDateParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isLocalDate(value)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Resource not found.', HttpStatus.NOT_FOUND);
    }
    return value;
  }
}

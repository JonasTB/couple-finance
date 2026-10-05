import { type ArgumentsHost, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@couple-finance/shared';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

function run(exception: unknown): { statusCode: number | undefined; body: unknown } {
  let statusCode: number | undefined;
  let body: unknown;
  const response = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (payload: unknown) => {
          body = payload;
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-123' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return { statusCode, body };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('renders AppException with code, details and request id', () => {
    const result = run(
      new AppException(ErrorCode.CONFLICT, 'Version conflict.', HttpStatus.CONFLICT, {
        version: 3,
      }),
    );
    expect(result).toEqual({
      statusCode: 409,
      body: {
        error: {
          code: 'CONFLICT',
          message: 'Version conflict.',
          details: { version: 3 },
          requestId: 'req-123',
        },
      },
    });
  });

  it('maps Nest HTTP exceptions to stable codes', () => {
    const result = run(new NotFoundException('Cannot GET /api/v1/nope'));
    expect(result.statusCode).toBe(404);
    expect(result.body).toMatchObject({ error: { code: 'NOT_FOUND', requestId: 'req-123' } });
  });

  it('hides internals of unknown errors', () => {
    const result = run(new Error('relation "users" does not exist at /srv/app/x.ts:10'));
    expect(result).toEqual({
      statusCode: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
          requestId: 'req-123',
        },
      },
    });
  });
});

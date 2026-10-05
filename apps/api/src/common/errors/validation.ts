import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { type FieldViolation, validationFailed } from './app.exception';

function flatten(errors: ValidationError[], parentPath = ''): FieldViolation[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: FieldViolation[] = error.constraints
      ? [{ field, constraints: Object.values(error.constraints) }]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Global DTO validation: whitelist + reject unknown properties (API_CONVENTIONS.md §3). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => validationFailed(flatten(errors)),
  });
}

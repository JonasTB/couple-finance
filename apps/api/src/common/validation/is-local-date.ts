import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isLocalDate } from '../time/local-date';

/** Validates a calendar date string `YYYY-MM-DD` (ADR-003). */
export function IsLocalDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isLocalDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} must be a valid date (YYYY-MM-DD)`, ...options },
      validator: { validate: (value: unknown) => isLocalDate(value) },
    });
  };
}

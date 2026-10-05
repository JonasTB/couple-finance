import { QueryFailedError } from 'typeorm';

const PG_UNIQUE_VIOLATION = '23505';

/** True when `error` is a PostgreSQL unique violation (optionally of one named constraint). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === PG_UNIQUE_VIOLATION &&
    (constraint === undefined ||
      ('constraint' in driverError && driverError.constraint === constraint))
  );
}

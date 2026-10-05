import { loadRootEnvFile } from '../src/config/load-env-file';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/couple_finance_test';

/** Points the app at the dedicated test database; never at the development database. */
export function applyTestEnv(): void {
  loadRootEnvFile();
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? DEFAULT_TEST_DATABASE_URL;
  // Generous limits so functional suites are not throttled; rate-limit.e2e-spec lowers them.
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = '10000';
  process.env.LOGIN_RATE_LIMIT_PER_EMAIL = '10000';
  process.env.API_RATE_LIMIT_PER_MINUTE = '100000';
}

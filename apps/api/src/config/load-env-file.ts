import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the monorepo root `.env` (local development only). Variables already present in the
 * process environment win, so CI/production configuration is never overridden.
 */
export function loadRootEnvFile(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (file) {
    process.loadEnvFile(file);
  }
}

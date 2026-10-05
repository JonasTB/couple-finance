/**
 * Deploy-time migrations (Stage 13, ADR-018). Run by `vercel-build` after the API compiled:
 *
 * - only when RUN_MIGRATIONS_ON_BUILD=true (set per Vercel environment: Production always;
 *   Preview only with a per-preview Neon branch, never against the production database);
 * - through the direct connection (DATABASE_URL_UNPOOLED, injected by Neon) when present;
 * - a failure fails the build, so the previous deployment keeps serving.
 *
 * Migrations run before the new code goes live, so they must stay backward compatible with the
 * running version (expand → deploy → contract).
 */
import { spawnSync } from 'node:child_process';

const log = (message: string) => process.stdout.write(`[migrate-on-deploy] ${message}\n`);

function host(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : '(none)';
  } catch {
    return '(invalid URL)';
  }
}

if (process.env.RUN_MIGRATIONS_ON_BUILD !== 'true') {
  log('RUN_MIGRATIONS_ON_BUILD is not "true": skipping migrations.');
} else {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    log('No DATABASE_URL_UNPOOLED or DATABASE_URL: cannot migrate.');
    process.exit(1);
  }
  log(`Running migrations on ${host(url)}…`);
  const result = spawnSync('pnpm', ['run', 'migration:run'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    log('Migrations failed: aborting the deployment.');
    process.exit(result.status ?? 1);
  }
  log('Migrations applied.');
}

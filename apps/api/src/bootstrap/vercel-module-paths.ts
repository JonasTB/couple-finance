import { existsSync } from 'node:fs';
import Module from 'node:module';
import { delimiter, join } from 'node:path';

/**
 * Vercel's NestJS builder (CLI 62.5+) flattens the compiled API to the function root
 * (/var/task/main.js, /var/task/bootstrap/…) but keeps dependencies at their monorepo paths
 * (/var/task/apps/api/node_modules, symlinked into /var/task/node_modules/.pnpm). Node never looks
 * there from the root, so this adds that folder to the module search path. It must be the first
 * import of main.ts. Locally, in tests and with `node dist/main.js` the folder does not exist next
 * to the entry point, and nothing changes. See ADR-018 (amendment 1).
 */
const flattenedServiceModules = join(__dirname, '..', 'apps', 'api', 'node_modules');

if (existsSync(flattenedServiceModules)) {
  process.env.NODE_PATH = [flattenedServiceModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(delimiter);
  // Re-reads NODE_PATH into the global search paths (long-standing Node internal).
  (Module as unknown as { _initPaths: () => void })._initPaths();
}

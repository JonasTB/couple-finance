// The ESM build lives in a package without "type": "module"; mark its folder explicitly.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/esm/package.json', import.meta.url), '{ "type": "module" }\n');

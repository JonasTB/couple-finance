import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

export function nest({ tsconfigRootDir }) {
  return tseslint.config(...base({ tsconfigRootDir }), {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Nest relies on decorated classes and DI-only constructors.
      '@typescript-eslint/no-extraneous-class': 'off',
      // `import { type X }` would erase DI tokens used by emitDecoratorMetadata.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  });
}

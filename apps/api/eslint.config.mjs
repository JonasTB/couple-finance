import { localPlugin } from '@couple-finance/eslint-config/local-plugin';
import { nest } from '@couple-finance/eslint-config/nest';

/**
 * Allowed module dependencies (docs/architecture/MODULES.md §2). A module not listed here
 * may depend on no other module. Update this map together with MODULES.md.
 */
const MODULE_DEPENDENCIES = {
  audit: [],
  users: [],
  auth: ['users'],
  households: ['users', 'audit'],
  categories: ['households'],
  incomes: ['households', 'audit'],
  transactions: ['households', 'categories', 'incomes', 'audit', 'users'],
  'recurring-expenses': ['households', 'categories', 'transactions', 'audit'],
  installments: ['households', 'categories', 'transactions', 'audit'],
  budgets: ['households', 'categories', 'transactions', 'audit'],
  goals: ['households', 'audit'],
  'purchase-plans': ['households', 'goals', 'transactions', 'audit'],
  analytics: ['households', 'categories', 'transactions', 'incomes', 'goals'],
  insights: ['households', 'users', 'analytics', 'budgets', 'installments'],
  health: [],
};

export default [
  { ignores: ['test/jest-e2e.config.js'] },
  ...nest({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.ts'],
    plugins: { local: localPlugin },
    rules: { 'local/module-boundaries': ['error', { allowed: MODULE_DEPENDENCIES }] },
  },
  {
    // Domain code is framework-free (DEPENDENCY_RULES.md).
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'typeorm',
                'express',
                'pg',
                'class-validator',
                'class-transformer',
              ],
              message: 'Domain code must not depend on frameworks or infrastructure.',
            },
          ],
        },
      ],
    },
  },
];

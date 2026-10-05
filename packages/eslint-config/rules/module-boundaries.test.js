import { test } from 'node:test';
import { RuleTester } from 'eslint';
import { moduleBoundaries } from './module-boundaries.js';

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2023, sourceType: 'module' } });
const options = [{ allowed: { auth: ['users'], households: ['users', 'audit'], users: [] } }];
const file = (relative) => `/repo/apps/api/src/${relative}`;

test('module-boundaries', () => {
  ruleTester.run('module-boundaries', moduleBoundaries, {
    valid: [
      {
        filename: file('modules/auth/application/auth.service.ts'),
        code: "import { UsersService } from '../../users/public';",
        options,
      },
      {
        filename: file('modules/auth/infrastructure/token.entity.ts'),
        code: "import { UserEntity } from '../../users/persistence';",
        options,
      },
      {
        filename: file('modules/users/user.entity.ts'),
        code: "import { X } from '../households/persistence';",
        options: [{ allowed: { users: ['households'] } }],
      },
      {
        filename: file('modules/auth/presentation/x.ts'),
        code: "import { Y } from '../application/y';",
        options,
      },
      {
        filename: file('modules/auth/presentation/x.ts'),
        code: "import { Clock } from '../../../common/time/clock';",
        options,
      },
      {
        filename: file('modules/auth/presentation/x.ts'),
        code: "import { Injectable } from '@nestjs/common';",
        options,
      },
      { filename: file('common/errors/x.ts'), code: "import { a } from './y';", options },
    ],
    invalid: [
      {
        filename: file('modules/auth/application/auth.service.ts'),
        code: "import { UsersService } from '../../users/users.service';",
        options,
        errors: [{ messageId: 'privateImport' }],
      },
      {
        filename: file('modules/auth/application/auth.service.ts'),
        code: "import { UserEntity } from '../../users/persistence';",
        options,
        errors: [{ messageId: 'persistenceOutsideInfrastructure' }],
      },
      {
        filename: file('modules/users/users.service.ts'),
        code: "import { AuthService } from '../auth/public';",
        options,
        errors: [{ messageId: 'forbiddenDependency' }],
      },
      {
        filename: file('common/auth/x.ts'),
        code: "import { UsersService } from '../../modules/users/public';",
        options,
        errors: [{ messageId: 'commonImportsModule' }],
      },
      {
        filename: file('modules/auth/x.ts'),
        code: "export * from '../users/users.service';",
        options,
        errors: [{ messageId: 'privateImport' }],
      },
    ],
  });
});

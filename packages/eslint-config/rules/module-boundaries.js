import path from 'node:path';

/**
 * Enforces backend module boundaries (docs/architecture/MODULES.md, DEPENDENCY_RULES.md):
 * - `src/common` must not import feature modules;
 * - a module imports another module only through its `public.ts` entry;
 * - `persistence.ts` (ORM entities for relations) may be imported only from
 *   `infrastructure/` folders or `*.entity.ts` files;
 * - module A may depend on module B only if B is listed in `allowed[A]`.
 * Only relative imports are inspected; packages are out of scope.
 */
const MODULES_SEGMENT = `${path.sep}src${path.sep}modules${path.sep}`;
const COMMON_SEGMENT = `${path.sep}src${path.sep}common${path.sep}`;
const ENTRY_POINTS = new Set(['public', 'persistence']);

function locate(absolutePath) {
  const index = absolutePath.lastIndexOf(MODULES_SEGMENT);
  if (index === -1) {
    return null;
  }
  const rest = absolutePath.slice(index + MODULES_SEGMENT.length).split(path.sep);
  const [name, ...inner] = rest;
  return {
    name,
    inner: inner
      .join('/')
      .replace(/\.(ts|tsx|js|mjs)$/, '')
      .replace(/\/index$/, ''),
  };
}

/** @type {import('eslint').Rule.RuleModule} */
export const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce feature-module boundaries and dependency direction.' },
    schema: [
      {
        type: 'object',
        properties: {
          allowed: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
        },
        required: ['allowed'],
        additionalProperties: false,
      },
    ],
    messages: {
      commonImportsModule:
        '`src/common` must not depend on feature modules (imported "{{target}}").',
      privateImport:
        'Import module "{{target}}" through its public entry ("{{target}}/public"), not "{{inner}}".',
      persistenceOutsideInfrastructure:
        '"{{target}}/persistence" may only be imported from infrastructure code or *.entity.ts files.',
      forbiddenDependency:
        'Module "{{from}}" may not depend on module "{{target}}" (allowed: {{allowedList}}). See docs/architecture/MODULES.md.',
    },
  },
  create(context) {
    const allowed = context.options[0]?.allowed ?? {};
    const filename = context.filename;
    const importer = locate(filename);
    const importerInCommon = filename.includes(COMMON_SEGMENT);

    function check(node) {
      const source = node.source?.value;
      if (typeof source !== 'string' || !source.startsWith('.')) {
        return;
      }
      const target = locate(path.resolve(path.dirname(filename), source));
      if (!target) {
        return;
      }
      if (importerInCommon) {
        context.report({ node, messageId: 'commonImportsModule', data: { target: target.name } });
        return;
      }
      if (!importer || importer.name === target.name) {
        return;
      }
      if (!ENTRY_POINTS.has(target.inner)) {
        context.report({
          node,
          messageId: 'privateImport',
          data: { target: target.name, inner: target.inner },
        });
        return;
      }
      const isInfrastructure =
        importer.inner.split('/').includes('infrastructure') || importer.inner.endsWith('.entity');
      if (target.inner === 'persistence' && !isInfrastructure) {
        context.report({
          node,
          messageId: 'persistenceOutsideInfrastructure',
          data: { target: target.name },
        });
        return;
      }
      const allowedTargets = allowed[importer.name] ?? [];
      if (!allowedTargets.includes(target.name)) {
        context.report({
          node,
          messageId: 'forbiddenDependency',
          data: {
            from: importer.name,
            target: target.name,
            allowedList: allowedTargets.length > 0 ? allowedTargets.join(', ') : 'none',
          },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export const localPlugin = { rules: { 'module-boundaries': moduleBoundaries } };

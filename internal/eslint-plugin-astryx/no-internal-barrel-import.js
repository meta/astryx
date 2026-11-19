// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-internal-barrel-import.js
 * @description Reports a relative import, inside a package's own source, that
 * resolves to a folder's index file (a barrel) rather than to the module that
 * defines what it imports: `import {List} from '../List'` instead of
 * `import {List} from '../List/List'`. A barrel pulls every sibling export into
 * the importer's module graph, so a lazily imported module that goes through
 * one drags unrelated code (and, in a single-file bundle, import cycles) with
 * it. Public consumers keep importing from the package entry
 * (`@astryxdesign/core`); this rule only reads relative specifiers.
 *
 * Reported, for `import`, `export … from` and `import()` with a literal
 * specifier: a `./` or `../` path that names a directory holding an
 * `index.{ts,tsx,js,jsx,mjs}` and no same-named module file. Type-only
 * imports and exports are left alone, since the compiler erases them.
 *
 * Options: `{baseline: {[repoRelativeFile]: string[]}, root: string}`.
 * `baseline` lists barrel imports that already existed when the rule was
 * introduced; those stay allowed, file by file and specifier by specifier, so
 * the rule catches new barrel imports without failing on the existing ones.
 * The list only shrinks. Its keys are relative to `root`, the repository root
 * (default: the directory ESLint runs from), so linting from a package
 * directory finds the same entries.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Where the repo config turns the rule on: shipped package source. Tests,
 * stories and test helpers never ship, so they may import barrels; a barrel
 * itself (a folder's or a package's index) is the public surface and may
 * re-export from other barrels (`architecture:public-component-api`). Shared
 * with the baseline script so both lint the same files.
 */
export const scope = {
  files: ['packages/*/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs}'],
  ignores: [
    '**/index.*',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.testing.*',
    '**/*.render-testing.*',
    '**/__tests__/**',
    '**/__fixtures__/**',
    '**/dist/**',
  ],
};

const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
];
const INDEX_FILES = MODULE_EXTENSIONS.map(extension => `index${extension}`);

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Whether a relative specifier, imported from `importer`, resolves to a
 * folder's index rather than to a module file.
 *
 * @param {string} importer absolute path of the importing file
 * @param {string} specifier the import's source string
 * @returns {boolean}
 */
export function resolvesToBarrel(importer, specifier) {
  if (!(
    specifier === '.' ||
    specifier === '..' ||
    /^\.\.?\//.test(specifier)
  )) {
    return false;
  }
  const target = path.resolve(path.dirname(importer), specifier);
  // Naming the index itself still reaches the barrel: '../List/index',
  // '../List/index.ts', or '../List/index.js', which TypeScript resolves to
  // index.ts.
  const base = path.basename(target);
  if (
    (base === 'index' || INDEX_FILES.includes(base)) &&
    INDEX_FILES.some(index => isFile(path.join(path.dirname(target), index)))
  ) {
    return true;
  }
  if (isFile(target)) {
    return false;
  }
  if (MODULE_EXTENSIONS.some(extension => isFile(target + extension))) {
    return false;
  }
  return (
    isDirectory(target) &&
    INDEX_FILES.some(index => isFile(path.join(target, index)))
  );
}

function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') {
    return true;
  }
  const specifiers = node.specifiers ?? [];
  return (
    specifiers.length > 0 &&
    specifiers.every(
      specifier =>
        specifier.importKind === 'type' || specifier.exportKind === 'type',
    )
  );
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow package-internal imports through a folder's index (barrel); import the defining module",
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseline: {
            type: 'object',
            additionalProperties: {type: 'array', items: {type: 'string'}},
          },
          root: {type: 'string'},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      barrel:
        "'{{source}}' resolves to a folder's index (a barrel). Inside a package, import the module that defines it (for example '../List/List', not '../List'), so a lazily imported module does not pull in every sibling export.",
    },
  },
  create(context) {
    const filename = context.filename;
    const baseline = context.options[0]?.baseline ?? {};
    const root = context.options[0]?.root ?? context.cwd;
    const relative = path.relative(root, filename).split(path.sep).join('/');
    const allowed = new Set(baseline[relative] ?? []);

    function check(node, source) {
      if (typeof source !== 'string' || allowed.has(source)) {
        return;
      }
      if (resolvesToBarrel(filename, source)) {
        context.report({node, messageId: 'barrel', data: {source}});
      }
    }

    return {
      ImportDeclaration(node) {
        if (!isTypeOnly(node)) {
          check(node.source, node.source.value);
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source != null && !isTypeOnly(node)) {
          check(node.source, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') {
          check(node.source, node.source.value);
        }
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          check(node.source, node.source.value);
        }
      },
    };
  },
};

export default rule;

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-internal-barrel-import.test.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-internal-barrel-import.js';

// A miniature package: `List/` is a barrel over `List/List.tsx`, `utils.ts`
// is a plain module, and `Thing/` has no index at all.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barrel-rule-'));
const write = (file, text = 'export {};\n') => {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(path.join(root, file), text);
};
write('src/List/index.ts', "export {List} from './List';\n");
write('src/List/List.tsx');
write('src/List/ListItem.tsx');
write('src/utils.ts');
write('src/Thing/Thing.tsx');
write('src/index.ts');
write('src/Menu/Menu.tsx');

const importer = path.join(root, 'src/Menu/Menu.tsx');
const fromCwd = path
  .relative(process.cwd(), importer)
  .split(path.sep)
  .join('/');

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const message = source =>
  `'${source}' resolves to a folder's index (a barrel). Inside a package, import the module that defines it (for example '../List/List', not '../List'), so a lazily imported module does not pull in every sibling export.`;

ruleTester.run('no-internal-barrel-import', rule, {
  valid: [
    // The defining module.
    {code: `import {List} from '../List/List';`, filename: importer},
    {code: `import {ListItem} from '../List/ListItem';`, filename: importer},
    // A plain module file, and a directory with no index.
    {code: `import {x} from '../utils';`, filename: importer},
    {code: `import {x} from '../Thing/Thing';`, filename: importer},
    // Public consumers import the package entry; only relative paths count.
    {code: `import {List} from '@astryxdesign/core';`, filename: importer},
    {code: `import {List} from '@astryxdesign/core/List';`, filename: importer},
    // Type-only imports and exports are erased by the compiler.
    {code: `import type {ListProps} from '../List';`, filename: importer},
    {code: `import {type ListProps} from '../List';`, filename: importer},
    {code: `export type {ListProps} from '../List';`, filename: importer},
    // A barrel import that existed when the rule arrived stays allowed.
    {
      code: `import {List} from '../List';`,
      filename: importer,
      options: [{baseline: {[fromCwd]: ['../List']}}],
    },
    // Baseline keys are relative to `root`, wherever ESLint runs from.
    {
      code: `import {List} from '../List';`,
      filename: importer,
      options: [{baseline: {'src/Menu/Menu.tsx': ['../List']}, root}],
    },
    // A `.js` specifier for an ordinary module is not a barrel.
    {code: `import {List} from '../List/List.js';`, filename: importer},
    // A computed dynamic import is not a literal path.
    {code: `const m = import(name);`, filename: importer},
  ],
  invalid: [
    {
      code: `import {List, ListItem} from '../List';`,
      filename: importer,
      errors: [{message: message('../List')}],
    },
    {
      code: `import {List, type ListProps} from '../List';`,
      filename: importer,
      errors: [{message: message('../List')}],
    },
    {
      code: `export {List} from '../List';`,
      filename: importer,
      errors: [{message: message('../List')}],
    },
    {
      code: `export * from '../List';`,
      filename: importer,
      errors: [{message: message('../List')}],
    },
    {
      code: `const lazy = () => import('../List');`,
      filename: importer,
      errors: [{message: message('../List')}],
    },
    // The package's own root index is a barrel too.
    {
      code: `import {x} from '..';`,
      filename: importer,
      errors: [{message: message('..')}],
    },
    // Naming the index file still reaches the barrel.
    {
      code: `import {List} from '../List/index';`,
      filename: importer,
      errors: [{message: message('../List/index')}],
    },
    // A `.js` specifier TypeScript maps onto index.ts.
    {
      code: `import {List} from '../List/index.js';`,
      filename: importer,
      errors: [{message: message('../List/index.js')}],
    },
    {
      code: `const lazy = () => import('../List/index.ts');`,
      filename: importer,
      errors: [{message: message('../List/index.ts')}],
    },
    // The baseline allows only the listed file and specifier.
    {
      code: `import {List} from '../List';`,
      filename: importer,
      options: [{baseline: {'src/Other/Other.tsx': ['../List']}}],
      errors: [{message: message('../List')}],
    },
  ],
});

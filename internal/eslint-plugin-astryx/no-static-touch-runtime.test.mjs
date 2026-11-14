// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-static-touch-runtime.test.mjs
 * @input A miniature Core source tree, and the repository's own Core source
 *   with the rule's allowlist
 * @output Evidence that the rule reports a component's static path into the
 *   touch runtime, allows type-only imports and loader-only runtime parts,
 *   and that the allowlist matches the source exactly
 * @position `architecture:react-component-runtime` INV13
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import {describe, expect, it} from 'vitest';
import rule, {touchRuntimeImports} from './no-static-touch-runtime.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const allowlist = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'no-static-touch-runtime.allowlist.json',
    ),
    'utf8',
  ),
).entries;

// A miniature Core: `motion/animator.ts` is a touch module and `utils/ride.ts`
// reaches it. `Panel` reaches it through `utils/ride.ts`, `Card` imports only
// its type, `Badge` re-exports it, and `Pill`'s touch part is reached only
// through the loader's `import()`.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-runtime-rule-'));
const write = (file, text = 'export {};\n') => {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(path.join(root, file), text);
};
write('src/motion/animator.ts', 'export const animatorFor = () => null;\n');
write('src/gestures/GestureHost.ts', 'export const host = null;\n');
write(
  'src/utils/ride.ts',
  "import {animatorFor} from '../motion/animator';\nexport const ride = animatorFor;\n",
);
write('src/utils/plain.ts', 'export const plain = 1;\n');
write('src/Panel/index.ts', "export {Panel} from './Panel';\n");
write(
  'src/Panel/Panel.tsx',
  "import {ride} from '../utils/ride';\nimport {plain} from '../utils/plain';\nexport const Panel = () => [ride, plain];\n",
);
write('src/Card/index.ts', "export {Card} from './Card';\n");
write(
  'src/Card/Card.tsx',
  "import type {Animator} from '../motion/animator';\nimport {type Host} from '../gestures/GestureHost';\nexport const Card = (a: Animator, h: Host) => [a, h];\n",
);
write('src/Badge/index.ts', "export {Badge} from './Badge';\n");
write(
  'src/Badge/Badge.tsx',
  "export * from '../motion/animator';\nexport const Badge = 1;\n",
);
write('src/Pill/index.ts', "export {Pill} from './Pill';\n");
write(
  'src/Pill/Pill.tsx',
  "export const Pill = () => import('./pillTouch');\n",
);
write(
  'src/Pill/pillTouch.ts',
  "import {host} from '../gestures/GestureHost';\nexport const touch = host;\n",
);
// A string that looks like a comment opener must not hide the re-export.
write(
  'src/utils/accept.ts',
  "const accept = 'image/*';\nconst docs = 'https://example.com';\nexport {animatorFor} from '../motion/animator';\nexport const kinds = [accept, docs];\n",
);
write('src/Upload/index.ts', "export {Upload} from './Upload';\n");
write(
  'src/Upload/Upload.tsx',
  "import {kinds} from '../utils/accept';\nexport const Upload = () => kinds;\n",
);
write('src/Paging/index.ts', "export {usePaging} from './usePaging';\n");
write(
  'src/Paging/usePaging.ts',
  "import {animatorFor} from '../motion/animator';\nexport const usePaging = animatorFor;\n",
);

const srcRoot = path.join(root, 'src');
const options = [{root, srcRoot: 'src', optInFolders: ['Paging']}];
const file = name => path.join(srcRoot, name);
const runtimeError = (specifier, to) => ({
  messageId: 'runtime',
  data: {specifier, to},
});

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-static-touch-runtime', rule, {
  valid: [
    {
      name: 'a type-only import of a touch module is erased',
      filename: file('Card/Card.tsx'),
      code: fs.readFileSync(file('Card/Card.tsx'), 'utf8'),
      options,
    },
    {
      name: "a runtime part that only the loader's import() reaches",
      filename: file('Pill/pillTouch.ts'),
      code: fs.readFileSync(file('Pill/pillTouch.ts'), 'utf8'),
      options,
    },
    {
      name: 'an opt-in entry a caller imports itself',
      filename: file('Paging/usePaging.ts'),
      code: fs.readFileSync(file('Paging/usePaging.ts'), 'utf8'),
      options,
    },
    {
      name: 'an allowlisted import',
      filename: file('Panel/Panel.tsx'),
      code: fs.readFileSync(file('Panel/Panel.tsx'), 'utf8'),
      options: [
        {
          ...options[0],
          allowlist: {
            'Panel/Panel.tsx -> utils/ride.ts': {
              why: 'test',
              removedBy: 'test',
            },
          },
        },
      ],
    },
  ],
  invalid: [
    {
      name: 'a component reaching a touch module through a shared module',
      filename: file('Panel/Panel.tsx'),
      code: fs.readFileSync(file('Panel/Panel.tsx'), 'utf8'),
      options,
      errors: [runtimeError('../utils/ride', 'utils/ride.ts')],
    },
    {
      name: "a shared module whose re-export follows a string like 'image/*'",
      filename: file('Upload/Upload.tsx'),
      code: fs.readFileSync(file('Upload/Upload.tsx'), 'utf8'),
      options,
      errors: [runtimeError('../utils/accept', 'utils/accept.ts')],
    },
    {
      name: 'a component re-exporting a touch module',
      filename: file('Badge/Badge.tsx'),
      code: fs.readFileSync(file('Badge/Badge.tsx'), 'utf8'),
      options,
      errors: [runtimeError('../motion/animator', 'motion/animator.ts')],
    },
  ],
});

describe('the touch-runtime allowlist (architecture:react-component-runtime INV13)', () => {
  const found = touchRuntimeImports(path.join(repoRoot, 'packages/core/src'), [
    'SnapPaging',
    'Swipe',
  ]).map(({from, to}) => `${from} -> ${to}`);

  it('lists every import that reaches the runtime', () => {
    expect(
      found.filter(key => !(key in allowlist)),
      'new import that puts the touch runtime in a first load',
    ).toEqual([]);
  });

  it('lists nothing that no longer reaches it, so the list only shrinks', () => {
    expect(
      Object.keys(allowlist).filter(key => !found.includes(key)),
      'allowlist entry the source no longer has: remove it',
    ).toEqual([]);
  });

  it('gives every entry a reason and the change that removes it', () => {
    for (const [key, entry] of Object.entries(allowlist)) {
      expect(entry.why, key).toMatch(/\S/);
      expect(entry.removedBy, key).toMatch(/\S/);
    }
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The two arms of the vibe eval: a fresh Vite app per library.
 * @input committed starter apps under eval/arms/<id>
 * @output arm descriptors: library name, commands, and the negative control
 * @position Read by run.mjs and the grader
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ARMS_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'arms',
);

/** Both arms use the same commands, so the grader treats them the same. */
const SHARED = {
  install: ['npm', 'ci', '--no-audit', '--no-fund', '--ignore-scripts'],
  typecheck: ['npx', '--no-install', 'tsc', '-b'],
  build: ['npx', '--no-install', 'vite', 'build'],
  entry: 'src/App.tsx',
  placeholder: 'export default function App() {\n  return null;\n}\n',
};

/** @type {Record<string, ArmDefinition>} */
export const ARMS = {
  'astryx-vite': {
    ...SHARED,
    id: 'astryx-vite',
    library: 'Astryx',
    packages: ['@astryxdesign/core', '@astryxdesign/cli'],
    negativeControl: [
      "import {Button} from '@astryxdesign/core/Button';",
      "import {Missing} from '@astryxdesign/core/DoesNotExist';",
      'export default function App() {',
      '  return <><Missing /><Button notAProp="x" /></>;',
      '}',
      '',
    ].join('\n'),
  },
  'shadcn-vite': {
    ...SHARED,
    id: 'shadcn-vite',
    library: 'shadcn/ui',
    packages: ['shadcn', 'radix-ui'],
    negativeControl: [
      "import {Button} from '@/components/ui/button';",
      "import {Missing} from '@/components/ui/does-not-exist';",
      'export default function App() {',
      '  return <><Missing /><Button notAProp="x" /></>;',
      '}',
      '',
    ].join('\n'),
  },
};

/**
 * @typedef {object} ArmDefinition
 * @property {string} id
 * @property {string} library Name used in the task prompt
 * @property {string[]} packages Packages whose installed versions are recorded
 * @property {string[]} install
 * @property {string[]} typecheck
 * @property {string[]} build
 * @property {string} entry File the agent builds the task in
 * @property {string} placeholder Starting content of the entry file
 * @property {string} negativeControl Entry content that must fail the type
 *   check and the build. If it passes either, the grader is broken and the
 *   run stops.
 */

/**
 * @param {string[]} ids
 * @returns {ArmDefinition[]}
 */
export function resolveArms(ids) {
  return ids.map(id => {
    const arm = ARMS[id];
    if (!arm) {
      throw new Error(
        `unknown arm "${id}"; expected one of: ${Object.keys(ARMS).join(', ')}`,
      );
    }
    return arm;
  });
}

export function armTemplateDir(arm) {
  return path.join(ARMS_ROOT, arm.id);
}

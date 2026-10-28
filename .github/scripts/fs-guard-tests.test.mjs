// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {fsGuardTests, scopedExtraTests} from './fs-guard-tests.mjs';

const sources = {
  'packages/core/src/Button/Button.test.tsx':
    "import {Button} from './Button';",
  'packages/core/src/Button/Button.tsx': 'export function Button() {}',
  'packages/core/src/serverSafe.test.ts': "import fs from 'node:fs';",
  'packages/cli/test/doc-quality.test.mjs':
    "import {guides} from '../foundation/discovery.mjs';",
  'packages/cli/foundation/discovery.mjs':
    "import {read} from './io.js';\nexport const guides = read();",
  'packages/cli/foundation/io.ts': "import {readFileSync} from 'fs';",
  'scripts/topics.test.mjs':
    'const load = name => import(`./topics/${name}.mjs`);',
  'scripts/plain.test.mjs': "import {sum} from './sum.mjs';",
  'scripts/sum.mjs': 'export const sum = (a, b) => a + b;',
  'scripts/literal.test.mjs': "const mod = await import('./sum.mjs');",
  'packages/core/src/motion/springRows.test.ts':
    "import {execFileSync} from 'node:child_process';",
  'packages/cli/test/readme-gen.test.mjs':
    "const {spawnSync} = require('child_process');",
  'packages/core/src/AspectRatio/AspectRatio.test.tsx':
    "const {readFileSync} = await import('fs');",
  'packages/core/src/theme/onMediaTokens.test.ts':
    'const fs = await import("fs/promises");',
  'scripts/node-prefix.test.cjs': "const fs = require('node:fs/promises');",
  'scripts/create-require.test.mjs':
    "const load = createRequire(import.meta.url);\nconst cp = load('child_process');",
  'scripts/actual.test.ts': "const real = await vi.importActual('fs');",
  'scripts/glob.test.ts':
    "const stories = import.meta.glob('./stories/*.tsx');",
  'scripts/named-like.test.mjs': "import {fsLike} from 'fs-extra-like';",
  'packages/cli/api/search/search-return-type.test.mjs':
    "import ts from 'typescript';\nconst program = ts.createProgram([path.join(here, 'search.mjs')], {});",
  'scripts/loader.test.mjs':
    "import {createRequire} from 'node:module';\nconst load = createRequire(import.meta.url);\nconst mod = load(computed);",
  'scripts/bundled.test.mjs': "const {buildSync} = require('esbuild');",
  'scripts/morph.test.ts': "import {Project} from 'ts-morph';",
  'scripts/babel.test.mjs': "import {transformFileSync} from '@babel/core';",
  'scripts/lint.test.mjs': "const {ESLint} = await import('eslint');",
  'scripts/plugin.test.mjs': "import plugin from 'eslint-plugin-local';",
};

const guards = () =>
  fsGuardTests(Object.keys(sources), file => {
    if (!(file in sources)) throw new Error(`untracked ${file}`);
    return sources[file];
  });

describe('fsGuardTests', () => {
  it('lists a test that reads the file system itself', () => {
    expect(guards()).toContain('packages/core/src/serverSafe.test.ts');
  });

  it('lists a test that reads sources through a helper it imports, .js naming .ts', () => {
    expect(guards()).toContain('packages/cli/test/doc-quality.test.mjs');
  });

  it('lists a test that imports a computed path', () => {
    expect(guards()).toContain('scripts/topics.test.mjs');
  });

  it('lists a test that runs a script in a child process, which reads what it likes', () => {
    expect(guards()).toContain('packages/core/src/motion/springRows.test.ts');
    expect(guards()).toContain('packages/cli/test/readme-gen.test.mjs');
  });

  it.each([
    'packages/core/src/AspectRatio/AspectRatio.test.tsx',
    'packages/core/src/theme/onMediaTokens.test.ts',
    'scripts/node-prefix.test.cjs',
    'scripts/create-require.test.mjs',
    'scripts/actual.test.ts',
    'scripts/glob.test.ts',
    'packages/cli/api/search/search-return-type.test.mjs',
    'scripts/loader.test.mjs',
    'scripts/bundled.test.mjs',
    'scripts/morph.test.ts',
    'scripts/babel.test.mjs',
    'scripts/lint.test.mjs',
  ])('lists %s, which names a file module in another spelling', file => {
    expect(guards()).toContain(file);
  });

  it('leaves out tests whose imports read no files', () => {
    expect(guards()).not.toContain('scripts/named-like.test.mjs');
    expect(guards()).not.toContain('scripts/plugin.test.mjs');
    expect(guards()).not.toContain('packages/core/src/Button/Button.test.tsx');
    expect(guards()).not.toContain('scripts/plain.test.mjs');
    expect(guards()).not.toContain('scripts/literal.test.mjs');
  });

  it('lists only tests', () => {
    expect(guards().every(file => /\.test\./.test(file))).toBe(true);
  });
});

describe('scopedExtraTests: tests that reach a changed package through its build', () => {
  const tree = {
    'packages/core/package.json': '{"name": "@astryxdesign/core"}',
    'packages/core/src/utils/color.ts': 'export const mix = () => 1;',
    'packages/core/src/utils/color.test.ts': "import {mix} from './color';",
    'packages/themes/neutral/package.json':
      '{"name": "@astryxdesign/theme-neutral"}',
    'packages/themes/neutral/src/neutralTheme.ts':
      "import {mix} from '@astryxdesign/core/theme';\nexport const theme = mix();",
    'packages/themes/neutral/src/neutralTheme.test.ts':
      "import {theme} from './neutralTheme';",
    'scripts/check-contrast.test.mjs':
      "import {mix} from '@astryxdesign/core';",
    'scripts/from-dist.test.mjs':
      "import {mix} from '../packages/core/dist/utils/color.js';",
    'scripts/unrelated.test.mjs':
      "import {theme} from '@astryxdesign/theme-neutral';",
  };
  const run = changed =>
    scopedExtraTests(Object.keys(tree), file => tree[file], changed);

  it('lists the tests whose imports reach a changed package by name or through its dist/', () => {
    expect(run(['packages/core/src/utils/color.ts'])).toEqual([
      'packages/themes/neutral/src/neutralTheme.test.ts',
      'scripts/check-contrast.test.mjs',
      'scripts/from-dist.test.mjs',
    ]);
  });

  it('lists none for a change to a package nothing reaches through its build, or to a test only', () => {
    expect(run(['packages/core/src/utils/color.test.ts'])).toEqual([]);
    expect(run(['docs/notes.md'])).toEqual([]);
  });

  it('follows the package that changed: a theme change lists its own importers', () => {
    expect(run(['packages/themes/neutral/src/neutralTheme.ts'])).toEqual([
      'scripts/unrelated.test.mjs',
    ]);
  });
});

describe('scopedExtraTests on this repository (contract)', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');

  it("a Core color utility change runs the theme packages' suites and the contrast checks that load Core's build", () => {
    const tests = scopedExtraTests(files, read, [
      'packages/core/src/utils/color.ts',
    ]);
    for (const expected of [
      'packages/themes/neutral/src/neutralTheme.test.ts',
      'packages/themes/stone/src/stoneTheme.test.ts',
      '.github/scripts/visual-gate/lib/probe-theme.test.mjs',
      'scripts/check-badge-contrast.test.mjs',
      'scripts/check-status-text-contrast.test.mjs',
    ]) {
      expect(tests).toContain(expected);
    }
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  fsGuardTests,
  scopedExtraTests,
  specReaderTests,
} from './fs-guard-tests.mjs';
import yaml from 'yaml';

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

describe('specReaderTests: the tests a spec-only change runs (spec:AST-030 FR2)', () => {
  const sources = {
    // Reads one record by a path relative to itself.
    'packages/core/src/motion/roles.test.ts':
      "import {readFileSync} from 'node:fs';\nconst spec = readFileSync(resolve(import.meta.dirname, '../../../../docs/specs/AST-094-x/spec.md'), 'utf8');",
    // Reads the component tree through a helper it imports.
    'scripts/components.test.mjs': "import {records} from './lib/records.mjs';",
    'scripts/lib/records.mjs':
      "import fs from 'node:fs';\nexport const records = () => fs.readdirSync('docs/specs/components');",
    // A computed record path names the whole tree.
    'scripts/any.test.mjs':
      "import fs from 'node:fs';\nconst read = id => fs.readFileSync(`docs/specs/${id}/spec.md`, 'utf8');",
    // So does path.join(root, 'docs', 'specs', …).
    'scripts/joined.test.mjs':
      "import fs from 'node:fs';\nconst dir = path.join(root, 'docs', 'specs');",
    // Names a record only in prose.
    'packages/core/src/Button/Button.a11y.test.tsx':
      "import fs from 'node:fs';\n/**\n * The contract (`docs/specs/AST-021/spec.md` FR5).\n */\n// see docs/specs/AST-021/spec.md\nexport {};",
    // Names a record as data but reads no files.
    'scripts/classify.test.mjs':
      "const path = 'docs/specs/AST-094-x/spec.md';\nexpect(classify(path)).toBe(true);",
  };
  const files = Object.keys(sources);
  const read = file => sources[file];

  it('lists every test whose imports read files and name a spec path in code', () => {
    expect(specReaderTests(files, read)).toEqual([
      'packages/core/src/motion/roles.test.ts',
      'scripts/components.test.mjs',
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
    ]);
  });

  it('narrows to the readers of a changed record: the record, a directory above it, or the whole tree', () => {
    expect(
      specReaderTests(files, read, ['docs/specs/AST-094-x/spec.md']),
    ).toEqual([
      'packages/core/src/motion/roles.test.ts',
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
    ]);
    expect(
      specReaderTests(files, read, [
        'docs/specs/components/Button/Button.spec.md',
      ]),
    ).toEqual([
      'scripts/components.test.mjs',
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
    ]);
    // A record no test names at all still runs the whole-tree readers.
    expect(
      specReaderTests(files, read, ['docs/specs/AST-001/spec.md']),
    ).toEqual(['scripts/any.test.mjs', 'scripts/joined.test.mjs']);
  });

  it('lists none for a change outside the spec tree', () => {
    expect(specReaderTests(files, read, ['packages/core/src/x.ts'])).toEqual(
      [],
    );
  });
});

describe('spec readers on this repository (contract)', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');

  it('a spec-only change to AST-094 runs the motion roles test that reads its FR4 table', () => {
    expect(
      specReaderTests(files, read, [
        'docs/specs/AST-094-touch-presentations/spec.md',
      ]),
    ).toContain('packages/core/src/motion/roles.test.ts');
  });

  it('a change to AST-084 runs the icon-set checks that read it', () => {
    expect(
      specReaderTests(files, read, ['docs/specs/AST-084-icon-sets/spec.md']),
    ).toContain('packages/cli/foundation/discovery/icon-set-checks.test.mjs');
  });

  const ci = yaml.parse(read('.github/workflows/ci.yml'));
  it.each([
    ['test-ui', 'test:ui'],
    ['test-node', 'test:node'],
  ])(
    '%s runs the readers of a changed record on a spec-only change, on one leg',
    (id, script) => {
      const steps = ci.jobs[id].steps;
      const index = name => steps.findIndex(step => step.name === name);
      const SPEC_LEG =
        "matrix.shard == 1 && steps.scope.outputs.spec_only == 'true'";
      const checkout =
        steps[
          index('Check out the change for the tests that read its records')
        ];
      expect(checkout).toMatchObject({
        if: SPEC_LEG,
        uses: 'actions/checkout@v7',
        with: {'fetch-depth': 2},
      });
      const list = steps[index('List the tests that read a changed record')];
      expect(list.if).toBe(SPEC_LEG);
      expect(list.run).toContain(
        'node .github/scripts/fs-guard-tests.mjs --spec-readers --changed HEAD^1',
      );
      const setup =
        steps[index('List the tests that read a changed record') + 1];
      expect(setup).toEqual({
        uses: './.github/actions/setup',
        if: "steps.spec-readers.outputs.any == 'true'",
      });
      const runner = steps.find(
        step =>
          step.name?.startsWith('Run the ') &&
          step.name.endsWith(' tests that read a changed record'),
      );
      expect(runner.if).toBe("steps.spec-readers.outputs.any == 'true'");
      expect(runner.run).toContain(
        `pnpm ${script} --passWithNoTests "\${READERS[@]}"`,
      );
      // Before the steps a spec-only change skips.
      expect(steps.indexOf(runner)).toBeLessThan(
        steps.findIndex(
          step =>
            step.uses === 'actions/checkout@v7' &&
            String(step.if).includes("spec_only != 'true'"),
        ),
      );
    },
  );
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  fsGuardTests,
  scopedExtraTests,
  specReaderTests,
  uiTestRoots,
} from './fs-guard-tests.mjs';
import os from 'node:os';
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
    // Reads family and design contracts through a helper.
    'scripts/contracts.test.mjs': "import {load} from './lib/contracts.mjs';",
    'scripts/lib/contracts.mjs':
      "import fs from 'node:fs';\nexport const load = () => [fs.readdirSync(path.join(root, 'docs/families')), fs.readdirSync(path.join(root, 'docs', 'design'))];",
    // Reads theme specs: the theme root and a spec file name.
    'scripts/theme-records.test.mjs':
      "import fs from 'node:fs';\nconst read = name => fs.readFileSync(path.join('packages/themes', name, `${name}.spec.md`), 'utf8');",
    // Reads theme sources, not their specs.
    'scripts/theme-sources.test.mjs':
      "import fs from 'node:fs';\nconst dirs = fs.readdirSync('packages/themes');",
    // A computed segment: the prefix ends inside a directory name.
    'scripts/segment.test.mjs':
      "import fs from 'node:fs';\nconst read = n => fs.readFileSync(`docs/specs/AST-${n}/spec.md`, 'utf8');",
    // Globs over the tree, with `**` and with `*`.
    'scripts/glob-deep.test.mjs':
      "import fs from 'node:fs';\nconst records = fs.globSync('docs/specs/**/spec.md');",
    'scripts/glob-star.test.mjs':
      "import fs from 'node:fs';\nconst records = fs.globSync('docs/specs/*/spec.md');",
    // Names a record as data but reads no files.
    'scripts/classify.test.mjs':
      "const path = 'docs/specs/AST-094-x/spec.md';\nexpect(classify(path)).toBe(true);",
  };
  // The records themselves are tracked too: a named path that is neither a
  // tracked file nor a directory is cut back to its last `/`.
  const files = [
    ...Object.keys(sources),
    'docs/specs/AST-094-x/spec.md',
    'docs/specs/AST-001/spec.md',
    'docs/specs/components/Button/Button.spec.md',
    'docs/families/action-groups.md',
    'docs/design/motion.md',
    'packages/themes/butter/butter.spec.md',
  ];
  const read = file => sources[file] ?? '';

  it('lists every test whose imports read files and name a spec path in code', () => {
    expect(specReaderTests(files, read)).toEqual([
      'packages/core/src/motion/roles.test.ts',
      'scripts/components.test.mjs',
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
      'scripts/contracts.test.mjs',
      'scripts/theme-records.test.mjs',
      'scripts/segment.test.mjs',
      'scripts/glob-deep.test.mjs',
      'scripts/glob-star.test.mjs',
    ]);
  });

  it('narrows to the readers of a changed record: the record, a directory above it, or the whole tree', () => {
    expect(
      specReaderTests(files, read, ['docs/specs/AST-094-x/spec.md']),
    ).toEqual([
      'packages/core/src/motion/roles.test.ts',
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
      'scripts/segment.test.mjs',
      'scripts/glob-deep.test.mjs',
      'scripts/glob-star.test.mjs',
    ]);
    expect(
      specReaderTests(files, read, [
        'docs/specs/components/Button/Button.spec.md',
      ]),
    ).toEqual([
      'scripts/components.test.mjs',
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
      'scripts/segment.test.mjs',
      'scripts/glob-deep.test.mjs',
      'scripts/glob-star.test.mjs',
    ]);
    // A record no test names at all still runs the whole-tree readers.
    expect(
      specReaderTests(files, read, ['docs/specs/AST-001/spec.md']),
    ).toEqual([
      'scripts/any.test.mjs',
      'scripts/joined.test.mjs',
      'scripts/segment.test.mjs',
      'scripts/glob-deep.test.mjs',
      'scripts/glob-star.test.mjs',
    ]);
  });

  it('covers every record a spec-only change may touch: family, design and theme spec records', () => {
    expect(
      specReaderTests(files, read, ['docs/families/action-groups.md']),
    ).toEqual(['scripts/contracts.test.mjs']);
    expect(specReaderTests(files, read, ['docs/design/motion.md'])).toEqual([
      'scripts/contracts.test.mjs',
    ]);
    // A theme spec runs the theme-spec reader, not the theme-source reader.
    expect(
      specReaderTests(files, read, ['packages/themes/butter/butter.spec.md']),
    ).toEqual(['scripts/theme-records.test.mjs']);
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

  it("each leg lists only its own Vitest project's readers", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-readers-'));
    const git = (...args) =>
      execFileSync('git', args, {cwd: work, encoding: 'utf8'});
    const write = (file, text) => {
      fs.mkdirSync(path.join(work, path.dirname(file)), {recursive: true});
      fs.writeFileSync(path.join(work, file), text);
    };
    const list = project =>
      execFileSync(
        process.execPath,
        [
          path.join(root, '.github/scripts/fs-guard-tests.mjs'),
          '--spec-readers',
          '--project',
          project,
          '--changed',
          'HEAD^1',
        ],
        {cwd: work, encoding: 'utf8'},
      )
        .trim()
        .split('\n');
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'test');
      write('vitest.config.ts', read('vitest.config.ts'));
      write('docs/specs/AST-1/spec.md', '# Record\n');
      const reader =
        "import fs from 'node:fs';\nfs.readFileSync('docs/specs/AST-1/spec.md');\n";
      write('packages/core/src/x.test.ts', reader);
      write('scripts/y.test.mjs', reader);
      git('add', '-A');
      git('commit', '-qm', 'base');
      write('docs/specs/AST-1/spec.md', '# Record, changed\n');
      git('commit', '-qam', 'change');
      expect(list('ui')).toEqual(['packages/core/src/x.test.ts']);
      expect(list('node')).toEqual(['scripts/y.test.mjs']);
    } finally {
      fs.rmSync(work, {recursive: true, force: true});
    }
  });

  it("a renamed record runs the readers of its old name: the lister's diff turns renames off", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-readers-'));
    const git = (...args) =>
      execFileSync('git', args, {cwd: work, encoding: 'utf8'});
    const write = (file, text) => {
      fs.mkdirSync(path.join(work, path.dirname(file)), {recursive: true});
      fs.writeFileSync(path.join(work, file), text);
    };
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'test');
      write('docs/specs/AST-1-old/spec.md', '# Record\n');
      write(
        'packages/core/src/x.test.ts',
        "import fs from 'node:fs';\nfs.readFileSync('docs/specs/AST-1-old/spec.md');\n",
      );
      git('add', '-A');
      git('commit', '-qm', 'base');
      git('mv', 'docs/specs/AST-1-old', 'docs/specs/AST-1-new');
      git('commit', '-qm', 'rename');
      const listed = execFileSync(
        process.execPath,
        [
          path.join(root, '.github/scripts/fs-guard-tests.mjs'),
          '--spec-readers',
          '--changed',
          'HEAD^1',
        ],
        {cwd: work, encoding: 'utf8'},
      );
      expect(listed.trim().split('\n')).toEqual([
        'packages/core/src/x.test.ts',
      ]);
    } finally {
      fs.rmSync(work, {recursive: true, force: true});
    }
  });

  it('splits the readers by Vitest project as vitest.config.ts collects them', () => {
    const roots = uiTestRoots(read('vitest.config.ts'));
    expect(roots).toContain('packages/core/src/');
    const all = specReaderTests(files, read);
    const ui = all.filter(test => roots.some(root => test.startsWith(root)));
    expect(ui).toContain('packages/core/src/motion/roles.test.ts');
    expect(ui).not.toContain('scripts/check-knowledge.test.mjs');
    expect(() =>
      uiTestRoots("name: 'ui', include: ['packages/core/**/*.spec.ts']"),
    ).toThrow(/unexpected ui include/);
    expect(() => uiTestRoots("name: 'node'")).toThrow(/no ui project/);
  });

  const ci = yaml.parse(read('.github/workflows/ci.yml'));
  it.each([
    ['test-ui', 'test:ui', 'ui'],
    ['test-node', 'test:node', 'node'],
  ])(
    "%s runs its own project's readers of a changed record on a spec-only change, on one leg",
    (id, script, project) => {
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
        `node .github/scripts/fs-guard-tests.mjs --spec-readers --project ${project} --changed HEAD^1`,
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
      expect(runner.run).toContain(`pnpm ${script} "\${READERS[@]}"`);
      // A run that finds no test fails: the list is this project's own.
      expect(runner.run).not.toContain('--passWithNoTests');
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

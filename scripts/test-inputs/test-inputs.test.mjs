// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The test-inputs record: what it records, how a run's lines merge into
 *   it, and which file-reading tests a change runs by it (spec:AST-030 FR13).
 * @input record.mjs in child processes, merge.mjs and select.mjs.
 * @output A recorded read, listing, write and unseen step; a merged record
 *   with build outputs and setup steps folded in; and every safety rule of
 *   the selection.
 * @position Node contracts for scripts/test-inputs.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';

import {expandRecord, mergeLeg, mergeLegs, readLines} from './merge.mjs';
import {
  changeThatRunsEveryTest,
  selectByInputs,
  whyTestRuns,
} from './select.mjs';

const RECORD = path.join(import.meta.dirname, 'record.mjs');
const scratch = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, {recursive: true, force: true});
});
const tempDir = prefix => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
};

describe('the recorder', () => {
  it('records reads, probes, listings, writes and what it cannot see, for its owner and its Node children', () => {
    const out = tempDir('inputs-out-');
    const work = tempDir('inputs-work-');
    fs.writeFileSync(path.join(work, 'a.txt'), 'a');
    fs.mkdirSync(path.join(work, 'dir'));
    const child = `
      import fs from 'node:fs';
      fs.readFileSync(${JSON.stringify(path.join(work, 'a.txt'))});
    `;
    const script = `
      import fs from 'node:fs';
      import {readFileSync} from 'node:fs';
      import {execFileSync} from 'node:child_process';
      readFileSync(${JSON.stringify(path.join(work, 'a.txt'))});
      fs.existsSync(${JSON.stringify(path.join(work, 'missing.lock'))});
      fs.readdirSync(${JSON.stringify(path.join(work, 'dir'))});
      fs.writeFileSync(${JSON.stringify(path.join(work, 'out.txt'))}, 'x');
      fs.mkdtempSync(${JSON.stringify(path.join(work, 'tmp-'))});
      execFileSync(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(child)}]);
      execFileSync('true');
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=${RECORD}`,
        ASTRYX_TEST_INPUTS_DIR: out,
        ASTRYX_TEST_INPUTS_FOR: 'some.test.mjs',
      },
    });
    const lines = [...readLines(out)];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(new Set(lines.map(line => line.for))).toEqual(
      new Set(['some.test.mjs']),
    );
    const all = key => lines.flatMap(line => line[key]);
    expect(all('reads')).toContain(path.join(work, 'a.txt'));
    expect(all('probes')).toContain(path.join(work, 'missing.lock'));
    expect(all('lists')).toContain(path.join(work, 'dir'));
    expect(all('writes')).toContain(path.join(work, 'out.txt'));
    expect(
      all('writes').some(file => path.basename(file).startsWith('tmp-')),
    ).toBe(true);
    expect(all('unseen')).toEqual(['runs true']);
    // The Node child read the file too, under the same owner.
    expect(
      lines.filter(line => line.reads.includes(path.join(work, 'a.txt')))
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('records nothing without an owner', () => {
    const out = tempDir('inputs-out-');
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import fs from 'node:fs'; fs.readFileSync(${JSON.stringify(RECORD)});`,
      ],
      {
        env: {
          ...process.env,
          NODE_OPTIONS: `--import=${RECORD}`,
          ASTRYX_TEST_INPUTS_DIR: out,
          ASTRYX_TEST_INPUTS_FOR: '',
        },
      },
    );
    expect([...readLines(out)]).toEqual([]);
  });
});

describe('the merged record', () => {
  const root = '/repo';
  const tracked = new Set([
    'package.json',
    'packages/core/package.json',
    'packages/core/src/Button/Button.tsx',
    'packages/core/src/Card/Card.tsx',
    'packages/cli/package.json',
    'packages/cli/api/theme-edit/theme-edit.mjs',
    'packages/cli/api/theme-edit/theme-values.test.mjs',
    'packages/cli/assets/templates/blocks/Card.tsx',
    'docs/specs/AST-030/spec.md',
  ]);
  const ignored = paths =>
    new Set(
      paths.filter(
        file =>
          file.includes('/dist/') || file.startsWith('apps/sandbox/generated'),
      ),
    );
  const line = (owner, entry) => ({
    for: owner,
    reads: [],
    lists: [],
    writes: [],
    unseen: [],
    ...entry,
  });

  it("keeps each test's folders, folds in what a setup step wrote, and maps build output to its package", () => {
    const tests = mergeLeg(
      [
        line('step:theme-cache', {
          reads: [
            '/repo/packages/core/src/Button/Button.tsx',
            '/repo/packages/core/dist/index.js',
          ],
          writes: ['/tmp/theme-cache-1'],
        }),
        line('step:pack-cli', {
          writes: ['/tmp/cli-tarball-1'],
          unseen: ['runs npm'],
        }),
        line('packages/cli/api/theme-edit/theme-values.test.mjs', {
          reads: [
            '/repo/packages/cli/api/theme-edit/theme-edit.mjs',
            '/tmp/theme-cache-1/parts.json',
            '/repo/packages/core/dist/theme.js',
            // A probe for a file that is not there.
            '/repo/packages/bun.lock',
            '/repo/node_modules/react/index.js',
            '/tmp/fixture-9/package.json',
          ],
          lists: ['/repo/packages/core/src'],
          writes: ['/tmp/fixture-9'],
        }),
        line('packages/cli/test/packed.test.mjs', {
          reads: ['/tmp/cli-tarball-1/astryx.tgz'],
        }),
        line('scripts/nothing.test.mjs', {}),
      ],
      {root, tracked, ignored},
    );
    expect(tests['packages/cli/api/theme-edit/theme-values.test.mjs']).toEqual({
      folders: [
        'packages',
        'packages/cli/api/theme-edit',
        'packages/core/src',
        'packages/core/src/Button',
      ],
      trees: ['packages/core/'],
      unseen: [],
    });
    // What it reads from the packed CLI comes from a step that ran npm.
    expect(tests['packages/cli/test/packed.test.mjs'].unseen).toEqual([
      'runs npm',
    ]);
    // A test file that touched nothing still has its entry.
    expect(tests['scripts/nothing.test.mjs']).toEqual({
      folders: [],
      trees: [],
      unseen: [],
    });
    expect(Object.keys(tests).some(owner => owner.startsWith('step:'))).toBe(
      false,
    );
  });

  it("never lets a test's own write to a checkout file hide that it read it", () => {
    const tests = mergeLeg(
      [
        line('a.test.mjs', {
          reads: ['/repo/docs/specs/AST-030/spec.md'],
          writes: ['/repo/docs/specs/AST-030/spec.md', '/repo/docs'],
        }),
      ],
      {root, tracked, ignored},
    );
    expect(tests['a.test.mjs'].folders).toEqual(['docs/specs/AST-030']);
  });

  it('keeps each distinct folder set once and spells it out again on reading', () => {
    const leg = {
      'a.test.mjs': {folders: ['x'], trees: [], unseen: []},
      'b.test.mjs': {folders: ['x'], trees: ['packages/core/'], unseen: []},
    };
    const record = mergeLegs([leg], 'abc');
    expect(record.sets).toEqual([['x']]);
    expect(
      expandRecord(JSON.parse(JSON.stringify(record))).tests['b.test.mjs'],
    ).toEqual({
      folders: ['x'],
      trees: ['packages/core/'],
      unseen: [],
    });
    expect(() => expandRecord({...record, version: 0})).toThrow(/version/);
  });
});

describe('selection by recorded inputs', () => {
  const record = {
    tests: {
      'packages/cli/api/theme-edit/theme-values.test.mjs': {
        folders: ['packages/cli/api/theme-edit', 'packages/core/src/Button'],
        trees: ['packages/core/'],
        unseen: [],
      },
      'packages/cli/api/docs/docs.test.mjs': {
        folders: ['packages/cli/assets/templates/blocks'],
        trees: [],
        unseen: [],
      },
      'scripts/check-knowledge.test.mjs': {
        folders: [],
        trees: [],
        unseen: ['runs git'],
      },
    },
  };
  const tests = [
    ...Object.keys(record.tests),
    'packages/cli/test/new.test.mjs',
  ];

  it('leaves out only the tests none of whose inputs the change touches', () => {
    const {run, skipped} = selectByInputs(tests, record, [
      'packages/cli/assets/templates/blocks/Card.tsx',
    ]);
    expect(skipped).toEqual([
      'packages/cli/api/theme-edit/theme-values.test.mjs',
    ]);
    expect(run).toContain('packages/cli/api/docs/docs.test.mjs');
  });

  it('runs a test whose package build the change reaches', () => {
    expect(
      whyTestRuns(tests[0], record.tests[tests[0]], [
        'packages/core/src/Grid/Grid.doc.mjs',
      ]),
    ).toMatch(/built from packages\/core\//);
  });

  it('runs a test the change changes, one with no record, and one the record cannot see whole', () => {
    const {run} = selectByInputs(tests, record, [
      'packages/cli/api/theme-edit/theme-values.test.mjs',
    ]);
    expect(run).toEqual([
      'packages/cli/api/theme-edit/theme-values.test.mjs',
      'scripts/check-knowledge.test.mjs',
      'packages/cli/test/new.test.mjs',
    ]);
    const unrelated = selectByInputs(tests, record, ['README.md']);
    expect(unrelated.run).toEqual([
      'scripts/check-knowledge.test.mjs',
      'packages/cli/test/new.test.mjs',
    ]);
  });

  it('runs every test when the install, CI, the test setup or the build configuration changes', () => {
    for (const file of [
      'package.json',
      'packages/core/package.json',
      'pnpm-lock.yaml',
      '.github/workflows/ci.yml',
      'vitest.config.ts',
      'vitest.global-setup.node.mjs',
      'internal/test-utils/src/setup.ts',
      'packages/cli/test-utils/run-cli.mjs',
      'scripts/test-inputs/select.mjs',
      'tsconfig.base.json',
      'packages/core/tsup.config.ts',
      'scripts/build-css.mjs',
    ]) {
      expect(changeThatRunsEveryTest(['README.md', file]), file).toBe(file);
      expect(selectByInputs(tests, record, [file]).skipped, file).toEqual([]);
    }
    expect(
      changeThatRunsEveryTest(['packages/core/src/Button/Button.tsx']),
    ).toBeNull();
  });
});

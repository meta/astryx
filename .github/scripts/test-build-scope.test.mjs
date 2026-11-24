// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: each `test-build` part runs only when a change reaches its
 *   inputs, and its input list names everything its tests read, so a new
 *   dependency cannot silently skip a test (spec:AST-030 FR13).
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {TEST_BUILD_PARTS, namedPaths, scopeRegex} from './test-build-scope.mjs';

const require = createRequire(import.meta.url);
const {classifyChanges, isSharedInfraPath} = require('./change-scope.cjs');

const root = path.resolve(import.meta.dirname, '../..');
const files = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifests = Object.fromEntries(
  files
    .filter(
      file =>
        /^(?:packages|apps|internal)\/(?:[^/]+\/)*package\.json$/.test(file) &&
        !/(?:^|\/)(?:__fixtures__|fixtures|node_modules)\//.test(file),
    )
    .map(file => [file.replace(/\/package\.json$/, ''), JSON.parse(read(file))])
    .filter(([, manifest]) => typeof manifest.name === 'string'),
);
const packageDirs = Object.fromEntries(
  Object.entries(manifests).map(([folder, manifest]) => [
    manifest.name,
    folder,
  ]),
);
const ci = yaml.parse(read('.github/workflows/ci.yml'));
const job = ci.jobs['test-build'];
const step = name => job.steps.find(each => each.name === name);

const covers = (part, file) =>
  TEST_BUILD_PARTS[part].paths.some(entry =>
    entry.endsWith('/') ? file.startsWith(entry) : file === entry,
  );
const runs = (part, changed) =>
  classifyChanges(changed.map(filename => ({filename}))).fullSuite ||
  changed.some(file => new RegExp(scopeRegex(part)).test(file));

describe('test-build scope', () => {
  it.each(Object.keys(TEST_BUILD_PARTS))(
    'lists every package the %s part reads, with their runtime dependencies',
    part => {
      const named = namedPaths(
        files,
        read,
        TEST_BUILD_PARTS[part].entries,
        packageDirs,
      );
      // Workspace packages, then their own runtime dependencies.
      const packages = new Set(
        [...named].filter(entry => manifests[entry.replace(/\/$/, '')]),
      );
      for (const folder of packages) {
        const {dependencies = {}, peerDependencies = {}} =
          manifests[folder.replace(/\/$/, '')];
        for (const name of Object.keys({...dependencies, ...peerDependencies}))
          if (packageDirs[name]) packages.add(`${packageDirs[name]}/`);
      }
      const missing = [...named, ...packages].filter(
        entry =>
          !covers(part, entry) &&
          !covers(part, `${entry.replace(/\/$/, '')}/`) &&
          // A shared path runs every part whatever the list says.
          !isSharedInfraPath(entry.replace(/\/$/, '/x')),
      );
      expect(missing, `add these to ${part}'s paths`).toEqual([]);
    },
  );

  it('decides each part from its own list in the job', () => {
    const scope = step("Decide this job's scope");
    expect(scope.with.paths).toBe(
      `\${{ matrix.part == 'contracts' && '${scopeRegex('contracts')}' || '${scopeRegex('fixtures')}' }}`,
    );
    const part = step("Decide whether this part's inputs changed");
    expect(part.env.FULL_SUITE).toBe('${{ steps.scope.outputs.full_suite }}');
    expect(part.env.TOUCHES).toBe('${{ steps.scope.outputs.touches }}');
    expect(part.run).toContain(
      '::notice title=Not affected::Not affected: no input of test-build (${PART}) changed',
    );
    for (const name of [
      'Per-author heavy-suite caps',
      'Install Playwright',
      'Run Build package contracts',
      'Verify canonical setup compositions',
      'Verify guest fixture contrast',
    ])
      expect(step(name).if, name).toContain("steps.part.outputs.run == 'true'");
  });

  it.each([
    ['a Charts change', ['packages/charts/src/Bar/Bar.tsx'], []],
    [
      'a CLI change (the data-token check builds through the CLI)',
      ['packages/cli/api/init/init.mjs'],
      ['contracts', 'fixtures'],
    ],
    ['a Rich Text change', ['packages/richtext/src/Editor.tsx'], []],
    // Build and theme sources are shared theme-build inputs: every part runs.
    [
      'a Build change',
      ['packages/build/src/vite.ts'],
      ['contracts', 'fixtures'],
    ],
    [
      'a Core change',
      ['packages/core/src/Button/Button.tsx'],
      ['contracts', 'fixtures'],
    ],
    ['a root config change', ['package.json'], ['contracts', 'fixtures']],
  ])('runs the right parts for %s', (_, changed, expected) => {
    expect(
      Object.keys(TEST_BUILD_PARTS).filter(part => runs(part, changed)),
    ).toEqual(expected);
  });
});

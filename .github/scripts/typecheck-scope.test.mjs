// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a pull request typechecks the packages its change reaches,
 *   and falls back to every package whenever it cannot tell (spec:AST-030
 *   FR13).
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  EXCLUDED,
  chooseTypecheck,
  readExternalInputs,
} from './typecheck-scope.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// The workspace's manifests, from the tracked files (pnpm-workspace.yaml's
// packages: apps, packages, packages/themes and internal).
const manifests = Object.fromEntries(
  execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'})
    .split('\0')
    .filter(file =>
      /^(?:apps\/(?!example-)[^/]+|packages\/[^/]+|packages\/themes\/[^/]+|internal\/[^/]+)\/package\.json$/.test(
        file,
      ),
    )
    .map(file => [file.replace(/\/package\.json$/, ''), JSON.parse(read(file))])
    .filter(([, manifest]) => typeof manifest.name === 'string'),
);
const BASE = 'a'.repeat(40);
const scope = changed =>
  chooseTypecheck({
    fullSuite: 'false',
    mergeBase: BASE,
    manifests,
    changedFiles: () => changed,
  });
const short = names => names.map(name => name.replace('@astryxdesign/', ''));

describe('the typecheck scope', () => {
  it('narrows a Charts change to Charts and the packages that use it', () => {
    const choice = scope(['packages/charts/src/Bar/Bar.tsx']);
    expect(choice.mode).toBe('some');
    expect(short(choice.packages)).toEqual(['charts', 'cli', 'storybook']);
  });

  it('keeps a Core change wide: everything that builds from Core', () => {
    const choice = scope(['packages/core/src/Button/Button.tsx']);
    expect(choice.mode).toBe('some');
    expect(short(choice.packages)).toEqual(
      expect.arrayContaining(['core', 'lab', 'charts', 'cli', 'storybook']),
    );
  });

  it('typechecks the package a moved file left, as well as the one it reached', () => {
    // git lists both sides because the job's diff passes --no-renames.
    expect(read('.github/scripts/typecheck-scope.mjs')).toContain(
      "['diff', '--name-only', '--no-renames', '-z', base, 'HEAD']",
    );
    const choice = scope([
      'packages/charts/src/Bar/Bar.tsx',
      'packages/vega/src/Bar/Bar.tsx',
    ]);
    expect(short(choice.packages)).toEqual(
      expect.arrayContaining(['charts', 'cli', 'vega']),
    );
  });

  it("counts a file a package's tsconfig maps or includes as touching that package", () => {
    const externalInputs = readExternalInputs(root, manifests);
    expect(externalInputs['packages/cli']).toContain(
      'apps/docsite/src/templateDemoContent/demoContent.tsx',
    );
    const choice = chooseTypecheck({
      fullSuite: 'false',
      mergeBase: BASE,
      manifests,
      externalInputs,
      changedFiles: () => [
        'apps/docsite/src/templateDemoContent/demoContent.tsx',
        'packages/richtext/src/Editor.tsx',
      ],
    });
    expect(short(choice.packages)).toContain('cli');
  });

  it('never selects the packages the root typecheck leaves out', () => {
    for (const changed of [
      ['packages/core/src/Button/Button.tsx'],
      ['packages/charts/src/Bar/Bar.tsx'],
    ])
      for (const name of EXCLUDED)
        expect(scope(changed).packages).not.toContain(name);
  });

  it.each([
    [
      'a shared or unknown change',
      {fullSuite: 'true', mergeBase: BASE},
      'the change touches shared or unknown paths',
    ],
    [
      'a missing merge base',
      {fullSuite: 'false', mergeBase: ''},
      'no merge base was found',
    ],
  ])('typechecks everything for %s', (_, input, reason) => {
    expect(
      chooseTypecheck({...input, manifests, changedFiles: () => []}),
    ).toEqual({mode: 'all', packages: [], reason});
  });

  it('typechecks everything when git cannot list the change', () => {
    const choice = chooseTypecheck({
      fullSuite: 'false',
      mergeBase: BASE,
      manifests,
      changedFiles: () => {
        throw new Error('fatal: bad object');
      },
    });
    expect(choice.mode).toBe('all');
    expect(choice.reason).toBe(
      'git could not list the changed files (fatal: bad object)',
    );
  });

  it('names the packages it chose, and falls back to every package, in the job', () => {
    const ci = yaml.parse(read('.github/workflows/ci.yml'));
    const steps = ci.jobs.typecheck.steps;
    const step = name => steps.find(each => each.name === name);
    const base = step('Find the merge base for the typecheck scope');
    expect(base.if).toContain("steps.scope.outputs.full_suite == 'false'");
    expect(base.run).toContain(
      '.github/scripts/merge-base.sh "$BASE_REF" \'the typecheck scope\' 5 || true',
    );
    const choose = step('Choose the packages to typecheck');
    expect(choose.env.MERGE_BASE).toBe(
      '${{ steps.typecheck-base.outputs.sha }}',
    );
    expect(choose.run).toContain('node .github/scripts/typecheck-scope.mjs');
    expect(choose.run).toContain('echo \'mode=all\' >> "$GITHUB_OUTPUT"');
    const typecheck = step('Typecheck the packages in scope');
    expect(typecheck.env.SCOPE_MODE).toBe(
      '${{ steps.typecheck-scope.outputs.mode }}',
    );
    expect(typecheck.run).toContain(
      'pnpm -r --no-bail --workspace-concurrency=1 --if-present $SCOPE_FILTERS run typecheck',
    );
    expect(typecheck.run).toContain('pnpm typecheck');
    // Every package still builds first.
    expect(steps.indexOf(step('Build packages'))).toBeLessThan(
      steps.indexOf(typecheck),
    );
  });
});

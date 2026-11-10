// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a package typechecks in several smaller programs that
 *   together hold every file its project includes.
 *
 * One program over all of Core's files and tests ran out of the default
 * JavaScript heap on a 2-core runner. The source program and each test
 * program hold part of that type graph.
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import {describe, expect, it} from 'vitest';

import {isTestFile, planPrograms, projectFiles} from './typecheck-sharded.mjs';

const root = path.resolve(import.meta.dirname, '..');

describe('planPrograms', () => {
  const files = [
    'src/raw-import.d.ts',
    'src/index.ts',
    'src/Button/Button.tsx',
    'src/Button/Button.test.tsx',
    'src/Button/__tests__/Button.a11y.chromium.spec.ts',
    'src/Card/Card.tsx',
    'src/Card/Card.test.tsx',
    'src/gestures/__tests__/browser/fixture.ts',
    'src/gestures/__tests__/browser/gestures.interaction.browser.spec.ts',
    'src/reset.test.ts',
  ];

  it('puts the source in one program and every test in a test program', () => {
    const [source, ...tests] = planPrograms(files, 3);
    expect(source).toEqual([
      'src/Button/Button.tsx',
      'src/Card/Card.tsx',
      'src/index.ts',
      'src/raw-import.d.ts',
    ]);
    expect(tests.flat().filter(isTestFile).sort()).toEqual(
      files.filter(isTestFile).sort(),
    );
    // Every file is in at least one program.
    expect(new Set([source, ...tests].flat())).toEqual(new Set(files));
  });

  it("keeps a folder's tests together, with the ambient declarations", () => {
    const [, ...tests] = planPrograms(files, 3);
    expect(tests).toHaveLength(3);
    const gestures = tests.find(group =>
      group.includes('src/gestures/__tests__/browser/fixture.ts'),
    );
    expect(gestures).toContain(
      'src/gestures/__tests__/browser/gestures.interaction.browser.spec.ts',
    );
    for (const group of tests) expect(group).toContain('src/raw-import.d.ts');
  });

  it('never plans an empty test program', () => {
    const [, ...tests] = planPrograms(['src/a.ts', 'src/a.test.ts'], 3);
    expect(tests).toEqual([['src/a.test.ts']]);
  });
});

describe("Core's typecheck", () => {
  it('runs the sharded typecheck, then the docs typecheck', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
    );
    expect(pkg.scripts.typecheck).toBe(
      'node ../../scripts/typecheck-sharded.mjs --project tsconfig.json --shards 3 && pnpm typecheck:docs',
    );
  });

  it('covers every file of the project, in four programs', () => {
    const files = projectFiles(
      ts,
      path.join(root, 'packages/core/tsconfig.json'),
    );
    const programs = planPrograms(files, 3);
    expect(programs).toHaveLength(4);
    expect(new Set(programs.flat())).toEqual(new Set(files));
  });
});

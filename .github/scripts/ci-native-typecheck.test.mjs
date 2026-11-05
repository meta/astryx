// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the TypeScript checks of @astryxdesign/native.
 *
 * The native package is outside the root `pnpm build`, and Vitest neither
 * typechecks its source nor loads the declaration file of every platform
 * condition. The `typecheck` job is the only gate over both: its
 * `pnpm typecheck` runs native's own `typecheck` script, which checks the
 * package, builds it, and checks the emitted platform types, in that order.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const native = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/native/package.json'), 'utf8'),
);
const tsconfigTypes = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/native/tsconfig.types.json'),
    'utf8',
  ),
);

const rootScripts = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).scripts;

describe('native TypeScript checks', () => {
  it('run in the typecheck job, after the root build', () => {
    const runs = ci.jobs.typecheck.steps.map(step => step.run?.trim() ?? '');
    const build = runs.indexOf('pnpm build');
    const typecheck = runs.findIndex(run => /^\s*pnpm typecheck$/m.test(run));
    expect(build).toBeGreaterThan(-1);
    expect(typecheck).toBeGreaterThan(build);
    // `pnpm typecheck` runs every package's own typecheck; native is not
    // filtered out.
    expect(rootScripts.typecheck).toContain('run typecheck');
    expect(rootScripts.typecheck).not.toContain('@astryxdesign/native');
  });

  it("check the package, its build, and the emitted types, in that order", () => {
    expect(native.scripts.typecheck).toBe(
      'tsc --project tsconfig.json --noEmit && pnpm build && pnpm typecheck:types',
    );
  });

  it('check every emitted platform declaration file', () => {
    expect(native.scripts['typecheck:types']).toBe(
      'tsc --project tsconfig.types.json',
    );
    expect(native.scripts.build).toContain('generate.mjs --types');
    expect(tsconfigTypes.include).toEqual(['dist/types/*.d.ts']);
    // The root config skips declaration files, which are all this checks.
    expect(tsconfigTypes.compilerOptions.skipLibCheck).toBe(false);
  });
});

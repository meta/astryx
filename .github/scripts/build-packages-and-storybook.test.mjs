// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  bareComponentPaths,
  planBuild,
} from './build-packages-and-storybook.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const script = [
  'pnpm -F @astryxdesign/build build',
  'pnpm -F @astryxdesign/core build',
  'pnpm -F @astryxdesign/charts build',
  'pnpm -F @astryxdesign/vega build',
  'pnpm -F @astryxdesign/theme-neutral build',
  'pnpm bundle:cli-themes',
  'pnpm -F @astryxdesign/theme-late build',
].join(' && ');
const deps = {
  '@astryxdesign/core': ['@astryxdesign/build'],
  '@astryxdesign/charts': ['@astryxdesign/core'],
  '@astryxdesign/theme-neutral': ['@astryxdesign/core'],
  '@astryxdesign/theme-late': ['@astryxdesign/core'],
};
const plan = planBuild(script, name => deps[name] ?? []);
const labels = plan.map(step => step.label);
const after = label => plan[labels.indexOf(label)].after.map(i => labels[i]);

describe('build-packages-and-storybook plan', () => {
  it('runs every step of the root build, each once, plus Storybook', () => {
    expect(plan.map(step => step.command)).toEqual([
      ...script.split(' && '),
      'pnpm -F @astryxdesign/storybook build',
    ]);
  });

  it('starts a package build after the workspace packages it depends on', () => {
    expect(after('@astryxdesign/build')).toEqual([]);
    expect(after('@astryxdesign/vega')).toEqual([]);
    expect(after('@astryxdesign/charts')).toEqual(['@astryxdesign/core']);
    expect(after('@astryxdesign/theme-neutral')).toEqual([
      '@astryxdesign/core',
    ]);
  });

  it('keeps any other step a barrier in chain order', () => {
    expect(after('pnpm bundle:cli-themes')).toEqual(labels.slice(0, 5));
    expect(after('@astryxdesign/theme-late')).toEqual([
      '@astryxdesign/core',
      'pnpm bundle:cli-themes',
    ]);
  });

  it('builds Storybook after the packages its index records', () => {
    expect(after('storybook')).toEqual([
      '@astryxdesign/build',
      '@astryxdesign/charts',
      '@astryxdesign/vega',
    ]);
  });

  it('refuses a root build that no longer builds one of those packages', () => {
    expect(() =>
      planBuild(
        'pnpm -F @astryxdesign/build build && pnpm -F @astryxdesign/vega build',
        () => [],
      ),
    ).toThrow(/@astryxdesign\/charts/);
  });

  it('plans the real root build', () => {
    const {scripts} = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    );
    const real = planBuild(scripts.build, () => []);
    expect(real.length).toBe(scripts.build.split('&&').length + 1);
  });
});

describe('bare component paths', () => {
  it('names stories indexed before their package was built', () => {
    expect(
      bareComponentPaths({
        entries: {
          a: {id: 'a', componentPath: '@astryxdesign/charts'},
          b: {
            id: 'b',
            componentPath: './node_modules/@astryxdesign/charts/dist/index.js',
          },
          c: {
            id: 'c',
            componentPath: '../../packages/core/src/Button/index.ts',
          },
          d: {id: 'd'},
        },
      }),
    ).toEqual(['a: @astryxdesign/charts']);
  });
});

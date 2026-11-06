// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {classifyVisualScope} from './visual-scope.mjs';

const SCRIPT = path.join(import.meta.dirname, 'visual-scope.mjs');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-scope-'));
  const manifests = {
    core: {name: '@astryxdesign/core'},
    lab: {name: '@astryxdesign/lab', private: true, astryx: {canaryOnly: true}},
    charts: {
      name: '@astryxdesign/charts',
      private: true,
      astryx: {canaryOnly: true},
    },
  };
  for (const [name, manifest] of Object.entries(manifests)) {
    const dir = path.join(root, 'packages', name);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  }
  for (const [name, manifest] of [
    ['neutral', {name: '@astryxdesign/theme-neutral', private: false}],
    ['probe', {name: '@astryxdesign/theme-probe', private: true}],
    [
      'preview',
      {
        name: '@astryxdesign/theme-preview',
        private: true,
        astryx: {canaryOnly: true},
      },
    ],
  ]) {
    const dir = path.join(root, 'packages', 'themes', name);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  }
});
afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

describe('classifyVisualScope', () => {
  it.each([
    'pnpm-lock.yaml',
    'package.json',
    'packages/core/package.json',
    'apps/storybook/vite.config.ts',
    'packages/build/src/vite.ts',
    'unknown-rendering-input.toml',
  ])(
    'keeps shared input %s broad alone and beside a focused component',
    file => {
      for (const files of [
        [file],
        ['packages/core/src/Button/Button.tsx', file],
      ]) {
        expect(classifyVisualScope(files, root)).toMatchObject({
          hasStableVisual: true,
          broadStableVisual: true,
        });
      }
    },
  );

  it('fails closed for an empty path set', () => {
    expect(classifyVisualScope([], root)).toMatchObject({
      hasStableVisual: true,
      broadStableVisual: true,
    });
  });

  it.each([
    'apps/storybook/.storybook/preview.tsx',
    'apps/storybook/stories/Button.stories.tsx',
    '.github/scripts/visual-gate/gate.mjs',
    '.github/scripts/visual-gate/visual-gate.config.json',
    '.github/scripts/visual-scope.mjs',
    '.github/workflows/ci.yml',
  ])(
    'routes shared visual infrastructure through the canonical owner: %s',
    file => {
      expect(classifyVisualScope([file], root)).toMatchObject({
        hasStableVisual: true,
        broadStableVisual: true,
      });
    },
  );

  it('includes stable Core runtime changes', () => {
    const result = classifyVisualScope(
      ['packages/core/src/Button/Button.tsx'],
      root,
    );
    expect(result).toMatchObject({
      hasStableVisual: true,
      stableComponents: ['Button'],
      broadStableVisual: false,
    });
    expect(result.stableCoreFiles).toEqual([
      'packages/core/src/Button/Button.tsx',
    ]);
  });

  it('marks shared Core infrastructure as broad stable scope', () => {
    const result = classifyVisualScope(
      ['packages/core/src/theme/Theme.tsx'],
      root,
    );
    expect(result).toMatchObject({
      hasStableVisual: true,
      broadStableVisual: true,
      stableComponents: [],
    });
  });

  it('leaves a Changeset out: release notes render nothing', () => {
    expect(
      classifyVisualScope(
        ['packages/core/src/Button/Button.tsx', '.changeset/button-fix.md'],
        root,
      ),
    ).toMatchObject({
      hasStableVisual: true,
      broadStableVisual: false,
      stableComponents: ['Button'],
    });
    expect(classifyVisualScope(['.changeset/notes.md'], root)).toMatchObject({
      hasStableVisual: false,
      broadStableVisual: false,
    });
  });

  it('audits a shared Core module through its reverse dependents when the pull request runs what it reaches (spec:AST-030 FR13)', () => {
    const files = ['packages/core/src/hooks/useHold.ts'];
    expect(classifyVisualScope(files, root, {}, {scoped: true})).toMatchObject({
      hasStableVisual: true,
      broadStableVisual: false,
    });
    // Unscoped (main, a full-suite change), it keeps the whole plan.
    expect(classifyVisualScope(files, root)).toMatchObject({
      broadStableVisual: true,
    });
  });

  it('ignores Core tests and component docs — they do not change pixels', () => {
    const result = classifyVisualScope(
      [
        'packages/core/src/Button/Button.test.tsx',
        'packages/core/src/Button/Button.doc.mjs',
      ],
      root,
    );
    expect(result.hasStableVisual).toBe(false);
  });

  it('includes a non-private shipped theme', () => {
    const result = classifyVisualScope(
      ['packages/themes/neutral/src/neutralTheme.ts'],
      root,
    );
    expect(result).toMatchObject({
      hasStableVisual: true,
      stableThemes: ['neutral'],
    });
  });

  it('ignores build-only metadata in a stable theme package', () => {
    const result = classifyVisualScope(
      ['packages/themes/neutral/package.json'],
      root,
      {
        'packages/themes/neutral/package.json': {
          name: '@astryxdesign/theme-neutral',
          private: false,
          scripts: {build: 'node ../../../scripts/clean-dist.mjs && tsup'},
        },
      },
    );
    expect(result).toMatchObject({
      hasStableVisual: false,
      stableComponents: [],
      stableThemes: [],
    });
  });

  it('keeps a base-stable theme in scope when the PR marks it private', () => {
    const result = classifyVisualScope(
      ['packages/themes/neutral/package.json'],
      root,
      {
        'packages/themes/neutral/package.json': {
          name: '@astryxdesign/theme-neutral',
          private: true,
          astryx: {canaryOnly: true},
        },
      },
    );
    expect(result).toMatchObject({
      hasStableVisual: true,
      stableThemes: ['neutral'],
    });
  });

  it('uses trusted PR-head metadata for a promoted theme', () => {
    const result = classifyVisualScope(
      ['packages/themes/probe/package.json'],
      root,
      {
        'packages/themes/probe/package.json': {
          name: '@astryxdesign/theme-probe',
          private: false,
        },
      },
    );
    expect(result).toMatchObject({
      hasStableVisual: true,
      stableThemes: ['probe'],
    });
  });

  it('excludes the private probe fixture', () => {
    const result = classifyVisualScope(
      ['packages/themes/probe/src/probeTheme.ts'],
      root,
    );
    expect(result.hasStableVisual).toBe(false);
    expect(result.stableThemes).toEqual([]);
  });

  it('excludes Lab and records its release channel from package metadata', () => {
    const result = classifyVisualScope(
      ['packages/lab/src/Stat/Stat.tsx'],
      root,
    );
    expect(result.hasStableVisual).toBe(false);
    expect(result.canaryPackages).toEqual(['@astryxdesign/lab']);
  });

  it('rejects line breaks before writing GitHub outputs', () => {
    const manifests = path.join(root, 'manifests.json');
    const output = path.join(root, 'github-output');
    fs.writeFileSync(
      manifests,
      JSON.stringify({
        'packages/lab/package.json': {
          name: '@astryxdesign/lab\nhas_stable_visual=false',
          astryx: {canaryOnly: true},
        },
      }),
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [SCRIPT, '--manifests', manifests, '--github-output', output],
        {input: 'packages/lab/src/Stat/Stat.tsx\n'},
      ),
    ).toThrow();
  });

  it('does not hardcode package names — any canaryOnly package is excluded', () => {
    const result = classifyVisualScope(
      ['packages/charts/src/Bar.tsx', 'packages/themes/preview/src/theme.ts'],
      root,
    );
    expect(result.hasStableVisual).toBe(false);
    expect(result.canaryPackages).toEqual([
      '@astryxdesign/charts',
      '@astryxdesign/theme-preview',
    ]);
  });
});

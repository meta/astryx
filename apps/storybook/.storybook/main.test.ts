// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file main.test.ts
 * @input Storybook config, workspace alias table, and app package dependencies.
 * @output Regression coverage for source aliases and cold-clone config loading.
 * @position Node tests beside the Storybook configuration.
 * @description Guards two things that both keep `storybook dev` working from
 *   a cold clone, at two different resolution stages.
 *
 *   1. Vite's module graph: every runtime `@astryxdesign/*` dependency
 *      must be aliased to package source in `.storybook/main.ts`. Without an
 *      alias, Vite resolves the workspace link through the package's export
 *      map, which points at `dist/` build output that does not exist in a
 *      fresh worktree — `storybook dev` then fails its dependency scan
 *      (#5092: `@astryxdesign/richtext`). The same table feeds StyleX while
 *      preserving theme wildcard-only aliases and Vega's lack of StyleX imports.
 *   2. Storybook's own config loader: `main.ts` is evaluated by Node's ESM
 *      resolver before any alias from it is in play, so the specifiers
 *      `main.ts` itself imports must also resolve unbuilt (#5128:
 *      `@astryxdesign/build/vite` → `dist/vite.mjs`).
 */

import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest';
import * as build from '../../../packages/build/src/vite.ts';
import config, {workspaceAliases} from './main.ts';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mainTs = readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
) as {dependencies?: Record<string, string>};

const rootDir = path.resolve(__dirname, '../../..');
// viteFinal only consumes Vite's config; the Storybook loader options are unused.
const storybookOptions = {} as Parameters<
  NonNullable<typeof config.viteFinal>
>[1];

const workspaceDeps = Object.keys(pkg.dependencies ?? {}).filter(name =>
  name.startsWith('@astryxdesign/'),
);

/**
 * Specifiers `main.ts` imports at runtime. `import type` statements are
 * erased before Node ever sees them, so they are excluded — only the
 * specifiers the config loader actually has to resolve count.
 */
const runtimeImports = [
  ...mainTs.matchAll(/^import\s+(?!type\s)(?:[^;]*?from\s+)?'([^']+)';/gm),
].map(match => match[1]);

describe('storybook main.ts workspace source aliases', () => {
  let viteAliases: Record<string, string>;
  let stylexAliases: Record<string, string[]>;
  const stylexSpy = vi.spyOn(build, 'astryxStylex');

  beforeAll(async () => {
    // Call through to the real plugin so these assertions cover the options
    // consumed by StyleX as well as the config Vite receives.
    const viteConfig = await config.viteFinal!({}, storybookOptions);
    viteAliases = viteConfig.resolve!.alias as Record<string, string>;
    const options = stylexSpy.mock.lastCall![0];
    if (!options || !('stylexOptions' in options)) {
      throw new Error('Expected the Storybook StyleX options');
    }
    stylexAliases = options.stylexOptions!.aliases as Record<string, string[]>;
  });

  afterAll(() => stylexSpy.mockRestore());

  it('declares every runtime workspace dependency exactly once', () => {
    expect(workspaceDeps).not.toHaveLength(0);
    expect(workspaceAliases.map(({pkg}) => pkg).sort()).toEqual(
      [...workspaceDeps].sort(),
    );
  });

  it.each(workspaceDeps)(
    'resolves %s through the intended source entries',
    dep => {
      const packageName = dep.slice('@astryxdesign/'.length);
      const isTheme = packageName.startsWith('theme-');
      const packageDir = isTheme
        ? `themes/${packageName.slice('theme-'.length)}`
        : packageName;
      const source = path.join(rootDir, 'packages', packageDir, 'src');

      expect(viteAliases[dep]).toBe(
        isTheme ? path.join(source, 'source.ts') : source,
      );
      expect(existsSync(viteAliases[dep])).toBe(true);

      if (packageName === 'vega') {
        expect(stylexAliases).not.toHaveProperty(dep);
        expect(stylexAliases).not.toHaveProperty(`${dep}/*`);
      } else {
        expect(stylexAliases[`${dep}/*`]).toEqual([path.join(source, '*')]);
        if (isTheme) {
          expect(stylexAliases).not.toHaveProperty(dep);
        } else {
          expect(stylexAliases[dep]).toEqual([source]);
        }
      }
    },
  );

  it('preserves other Vite aliases while overriding workspace build entries', async () => {
    const viteConfig = await config.viteFinal!(
      {
        resolve: {
          alias: {
            'storybook-fixture': '/fixture.ts',
            '@astryxdesign/core': '/packages/core/dist',
          },
        },
      },
      storybookOptions,
    );

    expect(viteConfig.resolve!.alias).toMatchObject({
      'storybook-fixture': '/fixture.ts',
      '@astryxdesign/core': path.join(rootDir, 'packages/core/src'),
    });
  });
});

describe('storybook main.ts config-loader imports (#5128)', () => {
  it('sees the runtime imports of main.ts', () => {
    expect(runtimeImports).not.toHaveLength(0);
  });

  it('imports no workspace package by bare specifier', () => {
    // A bare `@astryxdesign/*` specifier here goes through that package's
    // export map, and every workspace export map points at `dist/`. The
    // Storybook config loader resolves it with plain Node ESM, so no Vite
    // alias can rescue it — the only cold-clone-safe form is a path into
    // the package's own source.
    expect(
      runtimeImports.filter(spec => spec.startsWith('@astryxdesign/')),
    ).toEqual([]);
  });

  it('reaches the Vite plugin through source that exists unbuilt', () => {
    const spec = runtimeImports.find(s => s.includes('packages/build'));
    expect(spec, 'main.ts should import the Astryx Vite plugin').toBeDefined();

    const resolved = path.resolve(__dirname, spec as string);
    expect(resolved).toContain(path.join('packages', 'build', 'src'));
    expect(existsSync(resolved)).toBe(true);
  });

  it('evaluates and returns a Vite config carrying the Astryx plugins', async () => {
    // The behavioral half: on a worktree without `packages/build/dist` this
    // import is what fails today. It is green on an already-built checkout
    // either way, which is why the structural assertions above carry the
    // permanent guard.
    const {default: config} = (await import('./main.ts')) as {
      default: {
        viteFinal: (
          config: Record<string, unknown>,
          options: unknown,
        ) => Promise<{
          plugins: {name?: string}[];
          resolve: {alias: Record<string, string>};
        }>;
      };
    };

    const viteConfig = await config.viteFinal({}, {});

    expect(viteConfig.plugins.map(plugin => plugin?.name)).toContain(
      'astryx-css-layer-order',
    );
    expect(viteConfig.resolve.alias['@astryxdesign/core']).toMatch(
      /packages[\\/]core[\\/]src$/,
    );
  });
});

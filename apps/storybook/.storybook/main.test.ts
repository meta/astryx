// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file main.test.ts
 * @input Storybook config, workspace alias table, app package dependencies,
 *   and the app's tsconfig.json.
 * @output Regression coverage for source aliases, source paths, cold-clone
 *   config loading and the preview head's icon link.
 * @position Node tests beside the Storybook configuration.
 * @description Guards three things that keep the Storybook app working from
 *   a cold clone, at three different resolution stages.
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
 *   3. TypeScript: `tsconfig.json` maps every runtime `@astryxdesign/*`
 *      dependency to the source entry its Vite alias uses, so `tsc` does not
 *      read missing `dist/` types. Every path it maps must exist.
 */

import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest';
import ts from 'typescript';
import * as build from '../../../packages/build/src/vite.ts';
import config, {workspaceAliases} from './main.ts';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
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

describe('storybook tsconfig.json source paths', () => {
  const appDir = path.join(__dirname, '..');
  const tsconfig = ts.readConfigFile(
    path.join(appDir, 'tsconfig.json'),
    ts.sys.readFile,
  );
  const paths = (tsconfig.config?.compilerOptions?.paths ?? {}) as Record<
    string,
    string[]
  >;
  /** The path from the app to `file`, with `/` on every platform. */
  const fromApp = (file: string) =>
    path.relative(appDir, file).split(path.sep).join('/');

  /**
   * Workspace dependencies that the app's own files import by subpath, as
   * stories import `@astryxdesign/core/Text`. A stylesheet or other asset is
   * not a module that tsc resolves, so it does not count.
   */
  const subpathDeps = [
    ...new Set(
      ['.storybook', 'stories']
        .flatMap(dir =>
          readdirSync(path.join(appDir, dir), {recursive: true})
            .map(String)
            .filter(file => /\.(ts|tsx|mts)$/.test(file))
            .map(file => path.join(appDir, dir, file)),
        )
        .flatMap(file =>
          [
            ...readFileSync(file, 'utf8').matchAll(
              /['"](@astryxdesign\/[^/'"]+)\/([^'"]+)['"]/g,
            ),
          ]
            .filter(
              ([, , subpath]) =>
                !/\.(css|svg|png|jpe?g|gif|woff2?|json)$/.test(subpath),
            )
            .map(([, dep]) => dep),
        ),
    ),
  ]
    .filter(dep => workspaceDeps.includes(dep))
    .sort();

  it('reads its paths', () => {
    expect(tsconfig.error).toBeUndefined();
    expect(Object.keys(paths)).not.toHaveLength(0);
  });

  it.each(workspaceDeps)(
    'maps %s to the source entry its Vite alias uses',
    dep => {
      const alias = workspaceAliases.find(entry => entry.pkg === dep);
      expect(alias, `${dep} needs a workspace alias`).toBeDefined();
      const entry = alias!.vite ?? `${alias!.src}/index.ts`;
      expect(paths[dep]).toEqual([fromApp(path.join(rootDir, entry))]);
    },
  );

  it('finds the subpath imports', () => {
    expect(subpathDeps).not.toHaveLength(0);
  });

  it.each(subpathDeps)("maps %s/* into that package's source", dep => {
    const alias = workspaceAliases.find(entry => entry.pkg === dep);
    expect(alias, `${dep} needs a workspace alias`).toBeDefined();
    const source = fromApp(path.join(rootDir, alias!.src));
    const targets = paths[`${dep}/*`] ?? [];
    expect(targets, `${dep}/* needs a paths entry`).not.toHaveLength(0);
    for (const target of targets) {
      expect(target.startsWith(`${source}/`), `${dep}/* -> ${target}`).toBe(
        true,
      );
    }
  });

  it('maps only to files and folders that exist', () => {
    const missing = Object.entries(paths).flatMap(([key, targets]) =>
      targets
        .filter(target => {
          // A wildcard target exists when the folder before its `*` does.
          const star = target.indexOf('*');
          const prefix = star === -1 ? target : target.slice(0, star);
          return !existsSync(path.resolve(appDir, prefix));
        })
        .map(target => `${key} -> ${target}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('storybook main.ts preview head', () => {
  it('links the built favicon.svg, so a story frame opened on its own asks for no /favicon.ico', async () => {
    const previewHead = config.previewHead as (
      head: string,
      options: unknown,
    ) => string | Promise<string>;
    expect(typeof previewHead).toBe('function');

    const head = await previewHead('<meta name="existing" />', {});

    expect(head).toContain('<meta name="existing" />');
    expect(head).toContain(
      '<link rel="icon" type="image/svg+xml" href="./favicon.svg" />',
    );
  });
});

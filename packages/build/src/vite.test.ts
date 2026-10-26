// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vite.test.ts
 * @description Verifies CSS layer-order injection in the Astryx Vite plugin.
 *   The library layer name is configurable (default `astryx-base`); the
 *   theme layer name is fixed at `astryx-theme`.
 */

import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import stylex from '@stylexjs/unplugin';
import {astryxStylex, LIGHTNINGCSS_TARGETS} from './vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getInjectedConfig(rootDir: string): any {
  const plugins = astryxStylex({rootDir});
  const configPlugin = plugins.find(p => p.name === 'astryx-config');
  expect(configPlugin, 'astryx-config plugin should exist').toBeTruthy();
  const config = (configPlugin as any).config;
  return typeof config === 'function' ? config() : config.handler();
}

function applyAlias(aliases: any[], id: string): string {
  for (const alias of aliases) {
    if (
      (typeof alias.find === 'string' && id.startsWith(alias.find)) ||
      (alias.find instanceof RegExp && alias.find.test(id))
    ) {
      return id.replace(alias.find, alias.replacement);
    }
  }
  return id;
}

/** Pull the injected `@layer ...;` order statement out of the plugin set. */
function getLayerOrder(plugins: ReturnType<typeof astryxStylex>): string {
  const layerPlugin = plugins.find(p => p.name === 'astryx-css-layer-order');
  expect(
    layerPlugin,
    'astryx-css-layer-order plugin should exist',
  ).toBeTruthy();
  const transform = (layerPlugin as any).transformIndexHtml;
  const tags =
    typeof transform === 'function' ? transform() : transform.handler();
  const styleTag = tags.find((t: any) => t.tag === 'style');
  expect(styleTag, 'a <style> tag should be injected').toBeTruthy();
  return styleTag.children as string;
}

describe('astryxStylex layer order (modern API)', () => {
  it('uses the astryx-* layer names (theme layer is astryx-theme)', () => {
    const order = getLayerOrder(astryxStylex());
    expect(order).toBe('@layer reset, astryx-base, astryx-theme, product;');
  });

  it('honors configured library and product layer names', () => {
    const order = getLayerOrder(
      astryxStylex({layers: {library: 'custom-base', product: 'app'}}),
    );
    // The theme layer stays astryx-theme regardless of other layer config.
    expect(order).toBe('@layer reset, custom-base, astryx-theme, app;');
  });
});

describe('astryxStylex layer order (legacy API)', () => {
  it('uses the astryx-* layer names (theme layer is astryx-theme)', () => {
    const order = getLayerOrder(astryxStylex({stylexOptions: {}}));
    expect(order).toBe('@layer reset, astryx-base, astryx-theme, product;');
  });
});

describe('astryxStylex Lightning CSS defaults (modern API)', () => {
  type StylexOptions = {
    lightningcssOptions: {
      targets: Record<string, number>;
      drafts?: {nesting: boolean};
    };
  };

  function getStylexOptions(
    options: Parameters<typeof astryxStylex>[0] = {},
  ): StylexOptions {
    const vite = vi.spyOn(stylex, 'vite');
    try {
      astryxStylex(options);
      return vite.mock.calls.at(-1)?.[0] as StylexOptions;
    } finally {
      vite.mockRestore();
    }
  }

  it('preserves native light-dark() at the supported browser floor', () => {
    expect(getStylexOptions().lightningcssOptions.targets).toEqual(
      LIGHTNINGCSS_TARGETS,
    );
  });

  it('keeps the floor when a consumer supplies another Lightning CSS option', () => {
    const options = getStylexOptions({
      stylexOverrides: {lightningcssOptions: {drafts: {nesting: true}}},
    }).lightningcssOptions;

    expect(options).toEqual({
      targets: LIGHTNINGCSS_TARGETS,
      drafts: {nesting: true},
    });
  });
});

/**
 * A production build had no equivalent of the dev server's split-layer plugin,
 * so StyleX's `@layer priorityN` blocks sat outside the declared order and
 * outranked `astryx-theme` — every component override a theme set was dropped.
 * The first fix WRAPPED those blocks in the library layer instead of splitting
 * them, which fixed the theme and broke the app: product StyleX landed below
 * `astryx-theme` too, so a theme could silently restyle code it does not own.
 *
 * These pin the plugin's wiring. That the partition is right in a real build is
 * vite.build.test.ts, and what it means for the cascade is
 * .github/scripts/theme-layer-cascade.js — unit tests over this hook passed
 * throughout both bugs.
 */
describe('astryxStylex build-time layer split', () => {
  const find = (plugins: ReturnType<typeof astryxStylex>) =>
    plugins.find(p => p.name === 'astryx-build-layer-split');

  it('is present on both the modern and the legacy API', () => {
    expect(find(astryxStylex())).toBeTruthy();
    expect(find(astryxStylex({stylexOptions: {}}))).toBeTruthy();
  });

  it('runs on a build only, after the StyleX plugin that emits the CSS', () => {
    const plugin = find(astryxStylex());
    expect(plugin?.apply).toBe('build');
    expect(plugin?.enforce).toBe('post');
  });

  // The dev middleware and the build hook read the same partition, so a build
  // that emits nothing is a build where StyleX collected nothing — never a
  // silent pass-through of unsplit CSS.
  it('does nothing when StyleX collected no rules', () => {
    const plugin = find(astryxStylex());
    const hook = (plugin as any).writeBundle;
    const fn = typeof hook === 'function' ? hook : hook.handler;
    const error = vi.fn();
    expect(() =>
      fn.call(
        {error},
        {dir: mkdtempSync(path.join(tmpdir(), 'astryx-empty-'))},
      ),
    ).not.toThrow();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('astryxStylex locale aliases', () => {
  it('routes generated and rich locale imports to their real package files', () => {
    const rootDir = path.join(tmpdir(), 'astryx-vite-alias');
    const aliases = getInjectedConfig(rootDir).resolve.alias;
    const corePackage = path.join(rootDir, 'node_modules/@astryxdesign/core');

    expect(
      applyAlias(aliases, '@astryxdesign/core/locales/fr-FR.generated.js'),
    ).toBe(
      path.join(corePackage, 'src/i18n/generated-locales/fr-FR.generated.ts'),
    );
    expect(applyAlias(aliases, '@astryxdesign/core/locales/fr-FR.json')).toBe(
      path.join(corePackage, 'locales/fr-FR.json'),
    );
    expect(applyAlias(aliases, '@astryxdesign/core/Button')).toBe(
      path.join(corePackage, 'src/Button'),
    );
  });
});

describe('astryxStylex optimizeDeps package discovery', () => {
  let rootDir: string;

  beforeAll(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'astryx-vite-'));
    for (const pkg of ['core', 'icons', 'charts']) {
      mkdirSync(path.join(rootDir, 'node_modules', '@astryxdesign', pkg), {
        recursive: true,
      });
    }
    mkdirSync(path.join(rootDir, 'node_modules', '@astryxdesign', '.cache'), {
      recursive: true,
    });
  });

  afterAll(() => {
    rmSync(rootDir, {recursive: true, force: true});
  });

  function getExclude(rootDirOption: string): string[] {
    const plugins = astryxStylex({rootDir: rootDirOption});
    const configPlugin = plugins.find(p => p.name === 'astryx-config');
    expect(configPlugin, 'astryx-config plugin should exist').toBeTruthy();
    const config = (configPlugin as any).config;
    const result = typeof config === 'function' ? config() : config.handler();
    return result.optimizeDeps.exclude;
  }

  it('excludes every installed @astryxdesign/* package, not just core', () => {
    expect(getExclude(rootDir).sort()).toEqual([
      '@astryxdesign/charts',
      '@astryxdesign/core',
      '@astryxdesign/icons',
    ]);
  });

  it('falls back to @astryxdesign/core when no packages are installed', () => {
    expect(getExclude(path.join(rootDir, 'does-not-exist'))).toEqual([
      '@astryxdesign/core',
    ]);
  });

  // Vitest's module transform provides a working `require` even for dynamic
  // file-URL imports, so an in-process test cannot catch CJS-isms that only
  // break in the shipped ESM bundle. This test compiles vite.ts exactly like
  // build.mjs does, then runs the discovery in a child `node` process under
  // real ESM semantics (where `require` is undefined).
  it('still discovers packages in the compiled ESM bundle (dist contract)', async () => {
    const {buildSync} = await import('esbuild');
    const {execFileSync} = await import('node:child_process');
    // Emit next to src/ so the bundle's externals (vite, @stylexjs/*)
    // resolve against this package's node_modules; dist/ is gitignored.
    const outfile = path.join(__dirname, '..', 'dist', 'vite.test-esm.mjs');
    try {
      buildSync({
        entryPoints: [path.join(__dirname, 'vite.ts')],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile,
        // SYNC: keep aligned with the external list in build.mjs
        external: [
          'vite',
          '@stylexjs/babel-plugin',
          '@stylexjs/unplugin',
          'path',
          'url',
          'node:fs',
          'node:path',
          'node:url',
        ],
      });
      const script = [
        `const {astryxStylex} = await import(${JSON.stringify(pathToFileURL(outfile).href)});`,
        `const plugin = astryxStylex({rootDir: ${JSON.stringify(rootDir)}})`,
        `  .find(p => p.name === 'astryx-config');`,
        `console.log(JSON.stringify(plugin.config().optimizeDeps.exclude));`,
      ].join('\n');
      const stdout = execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        {encoding: 'utf8'},
      );
      const exclude: string[] = JSON.parse(stdout.trim());
      expect(exclude.sort()).toEqual([
        '@astryxdesign/charts',
        '@astryxdesign/core',
        '@astryxdesign/icons',
      ]);
    } finally {
      rmSync(outfile, {force: true});
    }
  });
});

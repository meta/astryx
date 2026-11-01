// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-single-bundle.test.mjs
 * @input Core's source (the lazily imported module graphs) and Core's built
 *   package (packages/core/dist), bundled by esbuild
 * @output Pins that an app bundled as one esbuild file renders Core
 *   components, and that a code-split app still loads Core's lazy modules on
 *   demand. Core's lazy `import()`s make esbuild, bundling without code
 *   splitting, wrap every module they reach in a lazy initializer. A barrel in
 *   that set is side-effect-free, so esbuild drops its initializer call and a
 *   component such as List runs before its module is initialized ("reading
 *   'useId' of undefined"). Modules inside a lazily imported graph therefore
 *   import Core modules directly, never through a barrel.
 * @position Node test; the source checks need no build, the bundle checks run
 *   over Core's build output, which CI builds before the Node tests
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const CORE = path.join(REPO, 'packages/core');
const DIST_ENTRY = path.join(CORE, 'dist/index.js');
const require = createRequire(path.join(CORE, 'package.json'));
const esbuild = require('esbuild');
const {JSDOM} = createRequire(path.join(REPO, 'package.json'))('jsdom');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-single-bundle-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

const APP = `
  import {Item, List} from '@astryxdesign/core';
  import {createRoot} from 'react-dom/client';
  createRoot(document.getElementById('root')).render(
    <List><Item label="One" /></List>,
  );
`;

/** Bundles a tiny app from Core's built package. */
async function bundleApp(source, options = {}) {
  const entry = path.join(scratch, 'main.jsx');
  fs.writeFileSync(entry, source);
  return esbuild.build({
    entryPoints: [entry],
    absWorkingDir: CORE,
    nodePaths: [path.join(CORE, 'node_modules')],
    alias: {'@astryxdesign/core': DIST_ENTRY},
    bundle: true,
    jsx: 'automatic',
    define: {'process.env.NODE_ENV': '"production"'},
    loader: {'.css': 'empty'},
    write: false,
    logLevel: 'silent',
    ...options,
  });
}

/** Runs a bundle in a DOM and reports the errors and the root's HTML. */
async function render(bundle) {
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const errors = [];
  dom.window.addEventListener('error', event => {
    errors.push(String(event.error ?? event.message));
  });
  dom.window.console.error = (...args) => errors.push(args.join(' '));
  try {
    dom.window.eval(bundle);
  } catch (error) {
    errors.push(String(error));
  }
  await new Promise(resolve => setTimeout(resolve, 50));
  const html = dom.window.document.getElementById('root').innerHTML;
  dom.window.close();
  return {errors, html};
}

const hasBuild = fs.existsSync(DIST_ENTRY);

describe('Core in esbuild bundles', () => {
  it('imports no barrel from inside a lazily imported module graph', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(CORE, 'src/index.ts')],
      absWorkingDir: CORE,
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      outdir: path.join(scratch, 'source'),
      platform: 'browser',
      loader: {'.css': 'empty'},
      external: [
        'react',
        'react/*',
        'react-dom',
        'react-dom/*',
        '@stylexjs/stylex',
      ],
      logLevel: 'silent',
    });
    const {inputs} = result.metafile;
    const lazyRoots = Object.values(inputs).flatMap(input =>
      input.imports
        .filter(edge => edge.kind === 'dynamic-import')
        .map(edge => edge.path),
    );
    expect(lazyRoots.length).toBeGreaterThan(0);
    const lazy = new Set(lazyRoots);
    const queue = [...lazyRoots];
    while (queue.length > 0) {
      for (const edge of inputs[queue.shift()]?.imports ?? []) {
        if (edge.kind !== 'dynamic-import' && !lazy.has(edge.path)) {
          lazy.add(edge.path);
          queue.push(edge.path);
        }
      }
    }
    const barrelImports = [...lazy]
      .filter(file => file.startsWith('src/'))
      .flatMap(file =>
        inputs[file].imports
          .filter(
            edge =>
              edge.kind !== 'dynamic-import' &&
              /^src\/.*\/index\.tsx?$/.test(edge.path),
          )
          .map(edge => `${file} -> ${edge.original}`),
      );
    expect(barrelImports).toEqual([]);
  });

  it.skipIf(!hasBuild)(
    'renders List and Item from one esbuild file without code splitting',
    async () => {
      const result = await bundleApp(APP, {format: 'iife'});
      const {errors, html} = await render(result.outputFiles[0].text);
      expect(errors).toEqual([]);
      expect(html).toContain('role="list"');
      expect(html).toContain('One');
    },
    60_000,
  );

  it.skipIf(!hasBuild)(
    'keeps the bottom sheet out of the startup chunks of a code-split app',
    async () => {
      const result = await bundleApp(APP, {
        format: 'esm',
        splitting: true,
        outdir: path.join(scratch, 'split'),
        metafile: true,
      });
      const {outputs} = result.metafile;
      const entry = Object.keys(outputs).find(
        file => outputs[file].entryPoint != null,
      );
      const startup = new Set([entry]);
      const queue = [entry];
      while (queue.length > 0) {
        for (const edge of outputs[queue.shift()].imports) {
          if (edge.kind === 'import-statement' && !startup.has(edge.path)) {
            startup.add(edge.path);
            queue.push(edge.path);
          }
        }
      }
      const startupInputs = [...startup].flatMap(file =>
        Object.keys(outputs[file].inputs),
      );
      expect(
        startupInputs.filter(input =>
          input.includes('BottomSheet/BottomSheet.'),
        ),
      ).toEqual([]);
    },
    60_000,
  );
});

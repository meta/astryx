// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layer-toast-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 *   (.github/scripts/lib/component-size.js)
 * @output Proves an import of Layer loads none of Toast's modules. An import
 *   of useToast loads the viewport it registers with LayerProvider, and the
 *   swipe code with no import() in between
 * @position Node test over source, so it needs no build. Its build files live
 *   under the repository's `node_modules/.cache`, never the system temp
 *   directory, whose listing esbuild would read for every build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const CORE_SRC = path.join(REPO, 'packages/core/src');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

const TOAST_MODULE = /^packages\/core\/src\/Toast\//;

const CACHE = path.join(REPO, 'node_modules/.cache/astryx-layer-toast-bundle');
let scratch = '';
beforeAll(() => {
  fs.mkdirSync(CACHE, {recursive: true});
  scratch = fs.mkdtempSync(path.join(CACHE, 'run-'));
});
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * The size report's build of a component import (minified ESM for the
 * browser). React and StyleX stay external.
 */
const BUILD_OPTIONS = {
  absWorkingDir: REPO,
  // Never written (`write: false`): it only names the outputs.
  outdir: path.join(CACHE, 'out'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  define: {'process.env.NODE_ENV': '"production"'},
  loader: {'.css': 'empty'},
  external: [
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    '@stylexjs/stylex',
  ],
  metafile: true,
  write: false,
  logLevel: 'silent',
  splitting: true,
};

/**
 * The source modules that load with an import of `source`: its output and
 * every chunk that output imports statically, not those behind an `import()`.
 */
function modulesLoadedBy(name, source) {
  const file = path.join(scratch, `${name}.ts`);
  fs.writeFileSync(file, source);
  const {outputs} = esbuild.buildSync({
    ...BUILD_OPTIONS,
    entryPoints: [file],
  }).metafile;
  const loaded = new Set();
  const load = output => {
    if (loaded.has(output)) {
      return;
    }
    loaded.add(output);
    for (const {path: chunk, kind} of outputs[output].imports) {
      if (kind === 'import-statement' && chunk in outputs) {
        load(chunk);
      }
    }
  };
  load(
    Object.keys(outputs).find(
      output => outputs[output].entryPoint === path.relative(REPO, file),
    ),
  );
  const modules = new Set();
  for (const output of loaded) {
    for (const [input, {bytesInOutput}] of Object.entries(
      outputs[output].inputs,
    )) {
      if (bytesInOutput > 0) {
        modules.add(input);
      }
    }
  }
  return modules;
}

const LAYER = JSON.stringify(path.join(CORE_SRC, 'Layer/index.ts'));
const CORE = JSON.stringify(path.join(CORE_SRC, 'index.ts'));

describe('Layer and Toast in bundles', () => {
  it('loads no Toast module with LayerProvider', () => {
    const modules = modulesLoadedBy(
      'layer-provider',
      `export {LayerProvider} from ${LAYER};\n`,
    );
    expect(modules.has('packages/core/src/Layer/toastHost.tsx')).toBe(true);
    expect([...modules].filter(input => TOAST_MODULE.test(input))).toEqual([]);
  });

  it('loads no Toast module with the whole Layer entry', () => {
    const modules = modulesLoadedBy('layer', `export * from ${LAYER};\n`);
    expect([...modules].filter(input => TOAST_MODULE.test(input))).toEqual([]);
  });

  it('loads the viewport that useToast registers with LayerProvider', () => {
    const modules = modulesLoadedBy(
      'layer-provider-and-use-toast',
      `export {LayerProvider, useToast} from ${CORE};\n`,
    );
    expect(modules.has('packages/core/src/Toast/ToastViewport.tsx')).toBe(true);
    expect(modules.has('packages/core/src/Layer/toastHost.tsx')).toBe(true);
  });

  it('loads the swipe code with useToast, not behind an import()', () => {
    const modules = modulesLoadedBy(
      'use-toast-swipe',
      `export {useToast} from ${CORE};\n`,
    );
    expect(modules.has('packages/core/src/Toast/useToastGesture.ts')).toBe(
      true,
    );
  });
});

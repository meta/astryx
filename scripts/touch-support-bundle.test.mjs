// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch-support-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 *   (.github/scripts/lib/component-size.js); core's package.json; core's and
 *   the CLI's docs; core's and Lab's component source
 * @output Pins architecture:react-component-runtime INV13's bundle and
 *   boundary claims: Core's public entries carry none of the touch and gesture
 *   module until a component imports it; two components that import it share
 *   one copy per page; only the internal `internal/touch` entry reaches it,
 *   and no consumer doc or component `import()` does
 * @position Node test over source, so it needs no build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const CORE_SRC = path.join(REPO, 'packages/core/src');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

/** The gesture core the internal entry re-exports. */
const PRIMITIVE_INPUT = /^packages\/core\/src\/gestures\//;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-touch-module-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * Each output of a build of `entries`, with the bytes each source module puts
 * in it, built as the size report builds a component import. React and StyleX
 * stay external: they hold no touch code.
 */
function outputsOf(entries) {
  const result = esbuild.buildSync({
    absWorkingDir: REPO,
    entryPoints: entries,
    outdir: path.join(scratch, 'out'),
    bundle: true,
    splitting: true,
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
  });
  return Object.values(result.metafile.outputs).map(output =>
    Object.fromEntries(
      Object.entries(output.inputs).map(([input, {bytesInOutput}]) => [
        input,
        bytesInOutput,
      ]),
    ),
  );
}

/** The inputs matching `pattern` that put bytes in `bytes`. */
function bytesOf(bytes, pattern = PRIMITIVE_INPUT) {
  return Object.entries(bytes).filter(
    ([input, size]) => pattern.test(input) && size > 0,
  );
}

/** A scratch entry module with `source`. */
function entryWith(name, source) {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, source);
  return file;
}

/** Every file under `dir` whose name matches `pattern`. */
function filesUnder(dir, pattern) {
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        found.push(...filesUnder(full, pattern));
      }
    } else if (pattern.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

describe('the touch module in bundles', () => {
  it.each([
    ['the root entry', 'index.ts'],
    ['the hooks entry', 'hooks/index.ts'],
    ['the utils entry', 'utils/index.ts'],
  ])('is absent from %s', (_name, entry) => {
    for (const bytes of outputsOf([path.join(CORE_SRC, entry)])) {
      expect(bytesOf(bytes)).toEqual([]);
    }
  });

  it('is one copy that two components importing it share', () => {
    const component = name =>
      entryWith(
        `${name}.ts`,
        `import {GestureArena} from ${JSON.stringify(
          path.join(CORE_SRC, 'internal/touch.ts'),
        )};
export const ${name} = () => new GestureArena();
`,
      );
    const outputs = outputsOf([component('First'), component('Second')]);
    const holding = outputs.filter(
      bytes => bytes['packages/core/src/gestures/GestureArena.ts'] > 0,
    );
    expect(holding).toHaveLength(1);
    for (const bytes of outputs.filter(output => output !== holding[0])) {
      expect(bytesOf(bytes)).toEqual([]);
    }
  });
});

describe('the touch module internals', () => {
  it('have no entry in the exports map beside the internal touch entry', () => {
    const {exports} = JSON.parse(
      fs.readFileSync(path.join(REPO, 'packages/core/package.json'), 'utf8'),
    );
    expect(exports['./internal/touch']?.source).toBe('./src/internal/touch.ts');
    const other = Object.keys(exports).filter(key =>
      /^\.\/(gestures|motion|touch-support)(\/|$)/.test(key),
    );
    expect(other).toEqual([]);
  });

  it('are named by no consumer doc', () => {
    const docs = [
      ...filesUnder(CORE_SRC, /\.doc(\.[a-z]+)?\.mjs$/),
      ...filesUnder(path.join(REPO, 'packages/cli/assets/docs'), /\.mjs$/),
    ];
    const naming = docs.filter(file =>
      /\b(GestureArena|GestureRecognizer)\b|@astryxdesign\/core\/internal\//.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(naming.map(file => path.relative(REPO, file))).toEqual([]);
  });

  it('are never loaded through an import() in Core or Lab source', () => {
    const sources = [
      ...filesUnder(CORE_SRC, /\.(ts|tsx)$/),
      ...filesUnder(path.join(REPO, 'packages/lab/src'), /\.(ts|tsx)$/),
    ].filter(file => !/\.(test|spec)\.(ts|tsx)$|__tests__/.test(file));
    const dynamic = sources.filter(file =>
      /\bimport\(\s*['"][^'"]*(\/gestures\/|\/motion\/|touch-support|internal\/touch)/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(dynamic.map(file => path.relative(REPO, file))).toEqual([]);
  });
});

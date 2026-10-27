// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gesture-free-entries.test.mjs
 * @input Core's root, hooks and utils entries, bundled with the PR size
 *   report's esbuild options (.github/scripts/lib/component-size.js)
 * @output Pins architecture:react-component-runtime INV13's bundle claim for
 *   Core's public entries: none of them carries a byte of `gestures/` until a
 *   component imports it
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

const GESTURES = /^packages\/core\/src\/gestures\//;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gesture-free-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/** The `gestures/` modules that put bytes in a bundle of `entry`. */
function gestureBytesIn(entry) {
  const result = esbuild.buildSync({
    absWorkingDir: REPO,
    entryPoints: [entry],
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
  return Object.values(result.metafile.outputs).flatMap(output =>
    Object.entries(output.inputs)
      .filter(
        ([input, {bytesInOutput}]) => GESTURES.test(input) && bytesInOutput > 0,
      )
      .map(([input, {bytesInOutput}]) => `${input} (${bytesInOutput} B)`),
  );
}

describe("Core's public entries carry no gesture code", () => {
  it.each([
    ['the root entry', 'index.ts'],
    ['the hooks entry', 'hooks/index.ts'],
    ['the utils entry', 'utils/index.ts'],
  ])('%s', (_name, entry) => {
    expect(gestureBytesIn(path.join(CORE_SRC, entry))).toEqual([]);
  });
});

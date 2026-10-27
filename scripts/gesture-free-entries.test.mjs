// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gesture-free-entries.test.mjs
 * @input Core's utils entry, bundled with the PR size report's esbuild
 *   options (.github/scripts/lib/component-size.js)
 * @output Pins architecture:react-component-runtime INV13's bundle claim for
 *   the utils entry: it carries no byte of `gestures/` (the haptic switch's
 *   attribute lives in utils/hapticSwitch.ts for that)
 * @position Node test over source, so it needs no build. The root and hooks
 *   entries carry gesture code exactly as far as the components and hooks
 *   that use a gesture import it: scripts/touch-support-bundle.test.mjs pins
 *   that per import, against its list of gesture users
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

describe("Core's utils entry carries no gesture code", () => {
  it('bundles no byte of gestures/', () => {
    expect(gestureBytesIn(path.join(CORE_SRC, 'utils/index.ts'))).toEqual([]);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazy-sheet-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 *   (.github/scripts/lib/component-size.js)
 * @output Pins that a menu's static import keeps its on-demand bottom sheet's
 *   keyboard code on demand. The sheet's keyboard ride (the animator and
 *   `rideKeyboard`) stays in the chunks the import loads only when the sheet
 *   opens. A menu that uses the animator at once loads it with the menu. This
 *   holds though the layer runtime's keyboard cap imports the keyboard module
 *   statically.
 * @position Node test over source, so it needs no build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

/** The sheet's keyboard ride: the modules only the sheet's keyboard hook uses. */
const SHEET_RIDE_INPUT =
  /^packages\/core\/src\/(motion\/animator|keyboard\/rideKeyboard)\.ts$/;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-lazy-sheet-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * The bytes each source module puts in what an import of `name` from
 * `entry` loads at once. That is the entry chunk and every chunk it imports
 * statically. It also counts the bytes in the chunks the import loads only
 * through import(). It builds as the size report builds a component import.
 */
function importOf(entry, name) {
  const entryFile = path.join(scratch, `${name}.mjs`);
  fs.writeFileSync(
    entryFile,
    `export {${name}} from ${JSON.stringify(path.join(REPO, entry))};`,
  );
  const result = esbuild.buildSync({
    absWorkingDir: REPO,
    entryPoints: [entryFile],
    outdir: path.join(scratch, `out-${name}`),
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
  const outputs = result.metafile.outputs;
  const entryOutput = Object.keys(outputs).find(
    key => outputs[key].entryPoint != null,
  );
  const eager = new Set();
  const pending = [entryOutput];
  while (pending.length > 0) {
    const key = pending.pop();
    if (eager.has(key)) {
      continue;
    }
    eager.add(key);
    for (const {path: imported, kind} of outputs[key].imports) {
      if (kind === 'import-statement' && outputs[imported] != null) {
        pending.push(imported);
      }
    }
  }
  const bytesIn = keys => {
    const bytes = {};
    for (const key of keys) {
      for (const [input, {bytesInOutput}] of Object.entries(
        outputs[key].inputs,
      )) {
        bytes[input] = (bytes[input] ?? 0) + bytesInOutput;
      }
    }
    return bytes;
  };
  const onDemand = Object.keys(outputs).filter(
    key => !eager.has(key) && !key.endsWith('.map'),
  );
  return {eager: bytesIn(eager), onDemand: bytesIn(onDemand)};
}

/** The inputs matching `pattern` that put bytes in `bytes`. */
function rideIn(bytes) {
  return Object.entries(bytes)
    .filter(([input, size]) => SHEET_RIDE_INPUT.test(input) && size > 0)
    .map(([input]) => input)
    .sort();
}

describe('a menu with an on-demand bottom sheet', () => {
  it.each([
    ['DropdownMenu', 'packages/core/src/DropdownMenu/index.ts', []],
    // ContextMenu's touch growth plays on the animator, so the animator loads
    // with the menu. The sheet's own ride is then `rideKeyboard` alone.
    [
      'ContextMenu',
      'packages/core/src/ContextMenu/index.ts',
      ['packages/core/src/motion/animator.ts'],
    ],
    ['Selector', 'packages/core/src/Selector/index.ts', []],
    ['MultiSelector', 'packages/core/src/MultiSelector/index.ts', []],
  ])(
    "%s loads the sheet's keyboard ride only with the sheet",
    (name, entry, eagerRide) => {
      const {eager, onDemand} = importOf(entry, name);
      // The sheet still rides the keyboard, on demand.
      expect(rideIn(onDemand)).toEqual(
        [
          'packages/core/src/keyboard/rideKeyboard.ts',
          'packages/core/src/motion/animator.ts',
        ].filter(input => !eagerRide.includes(input)),
      );
      expect(rideIn(eager)).toEqual(eagerRide);
    },
  );
});

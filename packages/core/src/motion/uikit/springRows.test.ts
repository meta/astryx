// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file springRows.test.ts
 * @input springs.ts, bundled with esbuild in a child process
 * @output Fails when a bundle that imports one spring row, or registers the
 *   motion roles, carries a spring it does not use
 *   (`architecture:component-style-authoring` INV6)
 */

import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';

/** The minified bundle of `entry`, an ES module next to springs.ts. */
function bundle(entry: string): string {
  // esbuild runs in its own Node process: jsdom's TextEncoder fails its
  // startup check.
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "import {build} from 'esbuild';",
        'const result = await build({',
        `  stdin: {contents: ${JSON.stringify(entry)}, resolveDir: process.cwd(), loader: 'ts'},`,
        "  bundle: true, write: false, format: 'esm', minify: true, logLevel: 'silent',",
        '});',
        'process.stdout.write(result.outputFiles[0].text);',
      ].join('\n'),
    ],
    {cwd: __dirname, encoding: 'utf8'},
  );
}

// Values only one row carries, as a minified bundle writes them. The two
// sheet rows share a response, so their damping tells them apart.
const KEYBOARD = '555.0265';
const ALERT = '522.35';
const SHEET_DETENT = 'response:.3441442326,dampingRatio:1}';
const SHEET_DISMISS_SWIPE = 'response:.3441442326,dampingRatio:.8}';
const FINGER_TRACKING = '.86';
const DIRECT_CHANGE = '.825';

describe('spring rows', () => {
  it('a bundle that imports one row carries no other', () => {
    const keyboard = bundle(
      "import {KEYBOARD_SPRING} from './springs'; export const s = KEYBOARD_SPRING;",
    );
    expect(keyboard).toContain(KEYBOARD);
    for (const other of [ALERT, SHEET_DETENT, FINGER_TRACKING, DIRECT_CHANGE]) {
      expect(keyboard).not.toContain(other);
    }
    const detent = bundle(
      "import {SHEET_DETENT_SPRING} from './springs'; export const s = SHEET_DETENT_SPRING;",
    );
    expect(detent).toContain(SHEET_DETENT);
    for (const other of [KEYBOARD, ALERT, FINGER_TRACKING, DIRECT_CHANGE]) {
      expect(detent).not.toContain(other);
    }
  });

  it('registering the motion roles carries only the springs that are roles', () => {
    const roles = bundle(
      "import {registerSpringsTable} from './springs'; registerSpringsTable();",
    );
    expect(roles).toContain(FINGER_TRACKING);
    expect(roles).toContain(DIRECT_CHANGE);
    expect(roles).toContain(SHEET_DISMISS_SWIPE);
    for (const other of [KEYBOARD, ALERT, SHEET_DETENT]) {
      expect(roles).not.toContain(other);
    }
  });
});

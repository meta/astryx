// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouch.bundle.test.ts
 * @input DropdownMenuTouch.ts, bundled with esbuild in a child process
 * @output Fails when DropdownMenu's touch layer carries a spring row it does
 *   not play (`architecture:component-style-authoring` INV6)
 */

import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';

/** The minified bundle of `entry`, an ES module next to this file. */
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
        "  packages: 'external',",
        '});',
        'process.stdout.write(result.outputFiles[0].text);',
      ].join('\n'),
    ],
    {cwd: __dirname, encoding: 'utf8'},
  );
}

// Numbers only one spring row carries, as a minified bundle writes them.
const OTHER_ROWS = {
  keyboard: '555.0265',
  alertPresent: '522.35',
  sheetDetent: '.3441442326',
  fingerTracking: '.86',
  directChange: '.825',
};

describe('DropdownMenu touch layer', () => {
  it('carries UIKit\u2019s two menu springs and no other spring row', () => {
    const touch = bundle(
      "import {createMenuSurfaceMotion} from './DropdownMenuTouch'; export const create = createMenuSurfaceMotion;",
    );
    // The two roles it registers and plays (spec:AST-094 FR4, FR31).
    expect(touch).toContain('menuOpen');
    expect(touch).toContain('menuClose');
    for (const [row, value] of Object.entries(OTHER_ROWS)) {
      expect(touch, row).not.toContain(value);
    }
  });
});

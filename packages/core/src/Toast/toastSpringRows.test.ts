// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toastSpringRows.test.ts
 * @input useToastBannerSwipe.ts, bundled with esbuild in a child process
 * @output Fails when Toast's touch module carries a spring row it never
 *   plays (`architecture:component-style-authoring` INV6)
 * @position Colocated with useToastBannerSwipe.ts
 */

import {execFileSync} from 'node:child_process';
import {expect, it} from 'vitest';

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
        "  external: ['react', 'react-dom', '@stylexjs/stylex'],",
        '});',
        'process.stdout.write(result.outputFiles[0].text);',
      ].join('\n'),
    ],
    {cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26},
  );
}

// Numbers only one spring row carries, as a minified bundle writes them
// (motion/uikit/springRows.test.ts).
const KEYBOARD = '555.0265';
const ALERT = '522.35';
const SHEET_DETENT = '.3441442326';

it("Toast's touch module carries only the spring rows it plays", () => {
  const touchModule = bundle(
    "export {useToastBannerSwipe} from './useToastBannerSwipe';",
  );
  for (const row of [KEYBOARD, ALERT, SHEET_DETENT]) {
    expect(touchModule).not.toContain(row);
  }
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.server.test.ts
 * @input vitest; esbuild and a plain Node process (no window, no document)
 * @output Checks that importing the theme-timing reader, or the animated-layout
 *   module that reads it, does no DOM work and runs no StyleX at import
 * @position Testing; validates themeTiming.ts and animatedLayout.ts, which
 *   server-safe factories import
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/** Bundles `entry` and imports it in a fresh Node process; prints its export names. */
function importOnServer(entry: string): string[] {
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "import {build} from 'esbuild';",
        `const result = await build({entryPoints: [${JSON.stringify(entry)}], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent'});`,
        "const source = Buffer.from(result.outputFiles[0].text).toString('base64');",
        "if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('not a server');",
        "const mod = await import('data:text/javascript;base64,' + source);",
        'process.stdout.write(JSON.stringify(Object.keys(mod).sort()));',
      ].join('\n'),
    ],
    {cwd: __dirname, encoding: 'utf8'},
  );
  return JSON.parse(out) as string[];
}

describe('the theme-timing reader on the server', () => {
  it('imports with no window or document', () => {
    expect(importOnServer(path.join(__dirname, 'themeTiming.ts'))).toEqual([
      'declaredTimingTokens',
      'easedProgress',
      'readThemeTiming',
      'readThemeTimingOrInstant',
      'readThemeTokenText',
      'readThemeTokens',
      'resolveTiming',
    ]);
  });

  it('keeps the animated-layout module safe to import there too', () => {
    expect(importOnServer(path.join(__dirname, 'animatedLayout.ts'))).toContain(
      'createAnimatedLayout',
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createAnimator.server.test.ts
 * @input vitest; esbuild and a plain Node process (no window, no document)
 * @output Checks `spec:AST-107` FR6: importing the factory or the hook does
 *   no DOM work, so both are safe on the server
 * @position Testing; validates createAnimator.ts and hooks/useAnimator.ts
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

describe('the public animator on the server', () => {
  it('the factory imports with no window or document', () => {
    // The module also hands the hook its construction; the package root
    // re-exports `createAnimator` alone (publicSurface.test.ts).
    expect(importOnServer(path.join(__dirname, 'createAnimator.ts'))).toEqual([
      'createAnimator',
      'createAttachableAnimator',
    ]);
  });

  it('the hook imports with no window or document', () => {
    expect(
      importOnServer(path.join(__dirname, '..', 'hooks', 'useAnimator.ts')),
    ).toEqual(['useAnimator']);
  });
});

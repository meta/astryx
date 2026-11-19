// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDragToSnapPoints.server.test.ts
 * @input esbuild, a fresh Node process with no window or document
 * @output Checks `spec:AST-107` FR6: importing the snap-point factory and
 *   its hook does no DOM work, so both are safe on the server
 * @position Testing; validates createDragToSnapPoints.ts and
 *   hooks/useDragToSnapPoints.ts
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

describe('the snap-point drag on the server', () => {
  it('the factory imports with no window or document', () => {
    expect(
      importOnServer(path.join(__dirname, 'createDragToSnapPoints.ts')),
    ).toContain('createDragToSnapPoints');
  });

  it('the hook imports with no window or document', () => {
    expect(
      importOnServer(path.join(__dirname, '../hooks/useDragToSnapPoints.ts')),
    ).toContain('useDragToSnapPoints');
  });
});

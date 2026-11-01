// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file recognizerBundle.test.ts
 * @input Uses vitest, node:child_process and esbuild over the gestures
 *   sources
 * @output A production bundle of a page that constructs only a pan ships the
 *   gesture host and the pan, and none of the tap or long-press recognizers;
 *   press tracking ships no recognizer
 * @position Unit test of packages/core/src/gestures' bundled size
 *
 * The host and touch-action tell recognizers apart by an internal family
 * brand, never `instanceof`, so a bundler drops every recognizer a page does
 * not construct. Read from esbuild's metafile: the modules with bytes in the
 * minified, tree-shaken output. esbuild cannot run in this suite's jsdom
 * environment (it asserts on a native `TextEncoder`), so it runs in a child
 * process.
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const GESTURES = path.resolve(__dirname, '..');

const BUNDLE_SCRIPT = `
import {build} from 'esbuild';
import path from 'node:path';
const [contents, resolveDir] = process.argv.slice(1);
const result = await build({
  stdin: {contents, resolveDir, loader: 'ts'},
  bundle: true,
  write: false,
  minify: true,
  treeShaking: true,
  format: 'esm',
  platform: 'browser',
  packages: 'external',
  metafile: true,
  logLevel: 'silent',
  define: {'process.env.NODE_ENV': '"production"'},
});
const [output] = Object.values(result.metafile.outputs);
const modules = Object.entries(output.inputs)
  .filter(([, input]) => input.bytesInOutput > 0)
  .map(([file]) => path.basename(file));
process.stdout.write(JSON.stringify(modules));
`;

/** The gestures modules with bytes in a production bundle of `entry`. */
function bundledModules(entry: string): string[] {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', BUNDLE_SCRIPT, entry, GESTURES],
    {cwd: GESTURES, encoding: 'utf8', timeout: 120_000},
  );
  return JSON.parse(stdout) as string[];
}

describe('a gesture bundle', () => {
  it('ships only the recognizers a page constructs: a pan-only page has no tap or long press', () => {
    const modules = bundledModules(`
      import {getGestureHost} from './GestureHost';
      import {PanGestureRecognizer} from './PanGestureRecognizer';
      export function mount(element: Element): () => void {
        return getGestureHost(element.ownerDocument).attach(
          element,
          new PanGestureRecognizer(),
        );
      }
    `);
    expect(modules).toContain('GestureHost.ts');
    expect(modules).toContain('PanGestureRecognizer.ts');
    expect(modules).not.toContain('TapGestureRecognizer.ts');
    expect(modules).not.toContain('LongPressGestureRecognizer.ts');
  });

  it('ships the pan only when a page constructs one', () => {
    const modules = bundledModules(`
      import {getGestureHost} from './GestureHost';
      import {TapGestureRecognizer} from './TapGestureRecognizer';
      export function mount(element: Element): () => void {
        return getGestureHost(element.ownerDocument).attach(
          element,
          new TapGestureRecognizer(),
        );
      }
    `);
    expect(modules).toContain('TapGestureRecognizer.ts');
    expect(modules).not.toContain('PanGestureRecognizer.ts');
    expect(modules).not.toContain('LongPressGestureRecognizer.ts');
  });

  it('ships press tracking without the tap recognizer, which it only reads', () => {
    const modules = bundledModules(`
      import {getGestureHost} from './GestureHost';
      import {createPressTracker} from './PressTracker';
      export function mount(element: Element): () => void {
        const tracker = createPressTracker({
          getBounds: () => element.getBoundingClientRect(),
          view: element,
        });
        return getGestureHost(element.ownerDocument).attachConsumer(
          element,
          tracker,
        );
      }
    `);
    expect(modules).toContain('PressTracker.ts');
    expect(modules).not.toContain('TapGestureRecognizer.ts');
    expect(modules).not.toContain('PanGestureRecognizer.ts');
    expect(modules).not.toContain('LongPressGestureRecognizer.ts');
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Docsite example root follows Layout's reset (component:Layout FR8).
 *
 * The example root in ExampleBlock cannot import Core's internal
 * `layoutReset` (Core's `./internal/*` is reserved for Core and Lab), so it
 * composes the public `overlayPaddingReset` and mirrors the rest. This test
 * fails when the mirror and Layout's reset differ, so Layout stays the one
 * owner and the docs examples follow it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO = path.resolve(__dirname, '../../../..');
const read = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf8');

/** The custom-property declarations inside the object literal after `marker`. */
function declarations(source: string, marker: string): Record<string, string> {
  const start = source.indexOf(marker);
  expect(start, marker).toBeGreaterThanOrEqual(0);
  const body = source.slice(start, source.indexOf('},', start));
  return Object.fromEntries(
    Array.from(body.matchAll(/'(--[\w-]+)':\s*'([^']*)'/g), m => [m[1], m[2]]),
  );
}

describe('docsite example root (component:Layout FR8)', () => {
  const layoutReset = read('packages/core/src/Layout/layoutReset.ts');
  const exampleBlock = read(
    'apps/docsite/src/components/component-detail/ExampleBlock.tsx',
  );

  it('composes the same public reset that Layout composes', () => {
    expect(layoutReset).toMatch(/overlayPaddingReset\.reset,/);
    expect(exampleBlock).toMatch(
      /stylex\.props\(overlayPaddingReset\.reset, styles\.exampleRoot\)/,
    );
  });

  it('mirrors the rest of Layout reset, name for name and value for value', () => {
    const owner = declarations(layoutReset, 'const resetBeyondOverlays');
    const mirror = declarations(exampleBlock, 'exampleRoot:');
    expect(Object.keys(owner).length).toBeGreaterThan(0);
    expect(mirror).toEqual(owner);
  });
});

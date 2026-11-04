// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedPressRelease.test.ts
 * @input Core's component sources and interactionOverlay.stylex.ts
 * @output Every component that restates the shared touch press release
 *   (`SHARED_RELEASE`, `SHARED_RELEASE_REDUCED`, `SHARED_RELEASE_EASE`)
 *   spells the shared clock and curve exactly
 * @position Unit test beside interactionOverlay.stylex.ts. A component's own
 *   release style replaces the whole property, so it restates the shared
 *   values for a fine primary pointer.
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

/** The value a top-level `const NAME = …;` line assigns, as written. */
function valueOf(source: string, name: string): string | undefined {
  return source.match(new RegExp(`^const ${name} = (.+);$`, 'm'))?.[1];
}

describe('the shared touch press release, restated in components', () => {
  it('is spelled exactly as interactionOverlay.stylex.ts spells it', () => {
    const shared = readFileSync(
      resolve(__dirname, 'interactionOverlay.stylex.ts'),
      'utf8',
    );
    const pairs = [
      ['SHARED_RELEASE', 'PRESS_RELEASE_DURATION'],
      ['SHARED_RELEASE_REDUCED', 'PRESS_RELEASE_DURATION_REDUCED'],
      ['SHARED_RELEASE_EASE', 'RELEASE_EASE'],
    ] as const;
    const root = resolve(__dirname, '..');
    const restating: string[] = [];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
            walk(path);
          }
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|spec|stories)\.tsx?$/.test(entry.name)
        ) {
          const source = readFileSync(path, 'utf8');
          if (valueOf(source, 'SHARED_RELEASE') == null) {
            continue;
          }
          restating.push(path.slice(root.length));
          for (const [own, sharedName] of pairs) {
            const expected = valueOf(shared, sharedName);
            expect(expected, sharedName).toBeDefined();
            if (valueOf(source, own) !== expected) {
              offenders.push(`${path.slice(root.length)}: ${own}`);
            }
          }
        }
      }
    };
    walk(root);
    // A pattern that stopped matching would pass with nothing checked.
    expect(restating.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

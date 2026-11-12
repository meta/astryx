// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressTrackerFactory.test.ts
 * @input The sources of Core and Lab
 * @output Press tracking is built by a `create…` factory, not a class: no
 *   `class PressTracker`, and no press tracker constructed with `new`, anywhere
 *   (architecture:react-component-runtime INV13: the recognizer family is
 *   the one place the touch modules use classes)
 * @position Source boundary test of packages/core/src/gestures/PressTracker.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(__dirname, '../../../../..');

function sourcesUnder(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (/\.(m?[jt]sx?)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  if (fs.existsSync(directory)) {
    visit(directory);
  }
  return files;
}

describe('press tracking', () => {
  it('is built by createPressTracker: no class PressTracker, and no new PressTracker in Core or Lab (architecture:react-component-runtime INV13)', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'packages/core/src/gestures/PressTracker.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bclass PressTracker\b/);
    // Built from parts, so this file does not match itself.
    const construction = new RegExp(
      ['\\bnew ', 'PressTracker', '\\('].join(''),
    );
    const offenders = [
      ...sourcesUnder(path.join(ROOT, 'packages/core/src')),
      ...sourcesUnder(path.join(ROOT, 'packages/lab/src')),
    ]
      .filter(file => construction.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionReaders.test.ts
 * @input Core's source files
 * @output Verifies that script code decides Reduce Motion through the
 *   reduced-motion mark's owner module (reducesMotion or useReducesMotion),
 *   which counts a theme's reducedMotion: 'always' beside the person's
 *   setting: no other file spells the setting's query in script beyond its
 *   listed count, and no file outside the animator calls the animator's
 *   setting-only read
 * @position Guard for spec:AST-108 FR6's script readers
 */

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');

/**
 * Files that may spell the setting's query in script, with how many times
 * and why. A new read in one of them raises its count, so it fails too.
 */
const ALLOWED: Readonly<Record<string, readonly [number, string]>> = {
  'privateAttributes/reducedMotion.stylex.ts': [1, 'the readers themselves'],
  'motion/animator.ts': [
    1,
    'defaultPrefersReducedMotion, ORed with the mark where the animator decides',
  ],
  'motion/animatedLayout.ts': [1, 'ORs the setting with themeReducesMotion'],
  'motion/reducedMotion.ts': [
    2,
    'the setting split by pointer, for the CSS transition queries it exports',
  ],
  'BottomSheet/BottomSheetPanel.tsx': [
    1,
    "the setting split by pointer, ORed with useReducesMotion and a coarse pointer for 'always'",
  ],
  'keyboard/keyboardHeight.ts': [
    1,
    'detects how Chrome reports a keyboard under the OS setting, which a theme does not change: browser behavior, not a motion choice',
  ],
  'theme/themeAdaptations.ts': [
    1,
    'writes CSS media queries, not a script read',
  ],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories|testing)\./.test(name) &&
      !(name.endsWith('.stylex.ts') && !full.includes('privateAttributes'))
      ? [full]
      : [];
  });
}

const files = sourceFiles(SRC).map(file => ({
  name: path.relative(SRC, file).split(path.sep).join('/'),
  lines: readFileSync(file, 'utf-8').split('\n'),
}));

function isCode(line: string): boolean {
  const trimmed = line.trimStart();
  return !trimmed.startsWith('*') && !trimmed.startsWith('//');
}

describe('reduced-motion script readers', () => {
  it("spell the setting's query only in the listed files, each at most its listed count", () => {
    const over = files.flatMap(({name, lines}) => {
      const count = lines.filter(
        line =>
          isCode(line) &&
          line.includes("'(prefers-reduced-motion") &&
          !line.includes('@media'),
      ).length;
      const allowed = ALLOWED[name]?.[0] ?? 0;
      return count > allowed ? [`${name}: ${count} (allowed ${allowed})`] : [];
    });
    expect(over).toEqual([]);
  });

  it("call the animator's setting-only read only inside the motion foundation", () => {
    const callers = files
      .filter(({name}) => !name.startsWith('motion/'))
      .filter(({lines}) =>
        lines.some(
          line => isCode(line) && line.includes('defaultPrefersReducedMotion'),
        ),
      )
      .map(({name}) => name);
    expect(callers).toEqual([]);
  });
});

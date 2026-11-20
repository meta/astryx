// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionReaders.test.ts
 * @input Core's source files
 * @output Verifies that script code decides reduced motion through
 *   motion/reducedMotion.ts (reducesMotion or useReducesMotion), which counts
 *   a theme's reducedMotion: 'always' mark beside the person's setting
 * @position Guard for spec:AST-108 FR6: a script reader that reads the
 *   setting alone would ignore the mark
 */

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');

/** Files that may spell the setting's query in script, each with its reason. */
const ALLOWED: Readonly<Record<string, string>> = {
  'motion/reducedMotion.ts':
    'the one reader: reducesMotion and useReducesMotion',
  'motion/animator.ts':
    'its setting read is ORed with the mark where it decides',
  'motion/animatedLayout.ts': 'ORs the setting with themeReducesMotion',
  'Resizable/createResizable.ts':
    'a DOM-free entry: ORs the setting with themeReducesMotion, as animatedLayout does',
  'BottomSheet/BottomSheetPanel.tsx':
    'its coarse-pointer query is ORed with useReducesMotion',
  'keyboard/keyboardHeight.ts':
    'detects how Chrome reports a keyboard under the OS setting, which a theme does not change',
  'theme/themeAdaptations.ts': 'writes CSS media queries, not a script read',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories|testing)\.|\.stylex\.ts$/.test(name)
      ? [full]
      : [];
  });
}

describe('reduced-motion script readers', () => {
  it("read the setting only through motion/reducedMotion.ts, so a theme's 'always' reaches them", () => {
    const offenders = sourceFiles(SRC)
      .map(file => path.relative(SRC, file).split(path.sep).join('/'))
      .filter(file => !(file in ALLOWED))
      .filter(file =>
        readFileSync(path.join(SRC, file), 'utf-8')
          .split('\n')
          .some(
            line =>
              line.includes("'(prefers-reduced-motion") &&
              !line.includes('@media') &&
              !line.trimStart().startsWith('*') &&
              !line.trimStart().startsWith('//'),
          ),
      );
    expect(offenders).toEqual([]);
  });
});

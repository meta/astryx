// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file internalModulesNotExperimental.test.ts
 * @input vitest, the source of core's internal motion, gesture, keyboard and
 *   utility modules
 * @output Fails when one of them declares `@experimental`: those modules are
 *   internal and never exported (spec:AST-017 FR21, DEC-27), and the tag
 *   belongs only to a deliberately experimental public API
 * @position Testing; a repository guard over src/motion, src/gestures,
 *   src/keyboard and src/utils
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');
const INTERNAL_DIRS = ['motion', 'gestures', 'keyboard', 'utils'];

/** Every source file under `dir`, tests and declarations left out. */
function sourcesUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') {
        files.push(...sourcesUnder(full));
      }
    } else if (
      /\.(ts|tsx|mjs|js)$/.test(entry.name) &&
      !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

describe('internal modules', () => {
  it('declare no @experimental: only an experimental public API carries it', () => {
    const offenders: string[] = [];
    for (const dir of INTERNAL_DIRS) {
      const root = path.join(SRC, dir);
      if (!fs.existsSync(root)) {
        continue;
      }
      for (const file of sourcesUnder(root)) {
        fs.readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (/@experimental\b/.test(line)) {
              offenders.push(`${path.relative(SRC, file)}:${index + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('checks the directories it names', () => {
    expect(fs.existsSync(path.join(SRC, 'motion'))).toBe(true);
    expect(fs.existsSync(path.join(SRC, 'gestures'))).toBe(true);
    expect(sourcesUnder(path.join(SRC, 'motion')).length).toBeGreaterThan(5);
  });
});

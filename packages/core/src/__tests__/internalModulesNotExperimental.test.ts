// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file internalModulesNotExperimental.test.ts
 * @input vitest, the source of core's internal motion, gesture and keyboard
 *   modules, and of the package-private utility module (touchPresentation)
 * @output Fails when one of them declares `@experimental`: those modules are
 *   internal and never exported (spec:AST-017 FR21, DEC-27), and the tag
 *   belongs only to a deliberately experimental public API
 * @position Testing; a repository guard over src/motion, src/gestures,
 *   src/keyboard and src/utils/touchPresentation.ts. The rest of src/utils
 *   backs the public `@astryxdesign/core/utils` entry, where an experimental
 *   API may carry the tag
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');
const INTERNAL_DIRS = ['motion', 'gestures', 'keyboard'];
/** Package-private files in a directory that also backs a public entry. */
const INTERNAL_FILES = ['utils/touchPresentation.ts'];

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

/** The internal files the guard reads, relative to src. */
function checkedFiles(): string[] {
  const files: string[] = [];
  for (const dir of INTERNAL_DIRS) {
    const root = path.join(SRC, dir);
    if (fs.existsSync(root)) {
      files.push(...sourcesUnder(root));
    }
  }
  files.push(...INTERNAL_FILES.map(file => path.join(SRC, file)));
  return files.map(file => path.relative(SRC, file));
}

describe('internal modules', () => {
  it('declare no @experimental: only an experimental public API carries it', () => {
    const offenders: string[] = [];
    for (const file of checkedFiles()) {
      fs.readFileSync(path.join(SRC, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/@experimental\b/.test(line)) {
            offenders.push(`${file}:${index + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('checks the directories and files it names', () => {
    expect(fs.existsSync(path.join(SRC, 'motion'))).toBe(true);
    expect(fs.existsSync(path.join(SRC, 'gestures'))).toBe(true);
    expect(sourcesUnder(path.join(SRC, 'motion')).length).toBeGreaterThan(5);
    for (const file of INTERNAL_FILES) {
      expect(fs.existsSync(path.join(SRC, file)), file).toBe(true);
    }
  });

  it('leaves the public utils entry alone: of src/utils, only its package-private files are checked', () => {
    const utils = checkedFiles().filter(file =>
      file.startsWith('utils' + path.sep),
    );
    expect(utils).toEqual([path.join('utils', 'touchPresentation.ts')]);
  });
});

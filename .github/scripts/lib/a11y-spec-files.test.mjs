// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-spec-files.test.mjs
 * @input .github/scripts/lib/a11y-spec-files.mjs, playwright.config.ts and the
 *   spec files the Firefox list names
 * @output Proof that the Firefox project runs exactly the named hover specs,
 *   that each one is an accessibility spec in a hover component's folder, and
 *   that each one moves the pointer
 * @position Node coverage for the browser accessibility spec lists
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  A11Y_SPEC_GLOBS,
  FIREFOX_HOVER_SPECS,
  globToRegExp,
} from './a11y-spec-files.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const POINTER = /\.hover\(|mouse\.move\(|pointermove|mouseenter|pointerenter/;

describe('the Firefox hover specs', () => {
  it('names each spec once, in path order', () => {
    expect(FIREFOX_HOVER_SPECS.length).toBeGreaterThan(0);
    expect([...FIREFOX_HOVER_SPECS]).toEqual(
      [...new Set(FIREFOX_HOVER_SPECS)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('names accessibility specs that exist, in the hover components', () => {
    const globs = A11Y_SPEC_GLOBS.map(globToRegExp);
    for (const file of FIREFOX_HOVER_SPECS) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
      expect(
        globs.some(glob => glob.test(file)),
        file,
      ).toBe(true);
      expect(file, file).toMatch(
        /^packages\/core\/src\/(?:DropdownMenu|HoverCard|InfoTip|NavMenu|Tooltip)\//,
      );
    }
  });

  it('names only specs that move the pointer onto an element', () => {
    for (const file of FIREFOX_HOVER_SPECS)
      expect(read(file), file).toMatch(POINTER);
  });

  it("names every pointer-moving accessibility spec in the hover components' folders, but the DevTools-protocol ones", () => {
    // MenuPress drives input, and the Tooltip binding audit reads the
    // accessibility tree, through Chromium's DevTools protocol.
    const LEFT_OUT = [
      'packages/core/src/DropdownMenu/__tests__/MenuPress.a11y.chromium.spec.ts',
      'packages/core/src/Tooltip/__tests__/Tooltip.a11y.chromium.spec.ts',
    ];
    const globs = A11Y_SPEC_GLOBS.map(globToRegExp);
    const folders =
      /^packages\/core\/src\/(?:DropdownMenu|HoverCard|InfoTip|NavMenu|Tooltip)\//;
    const moving = execFileSync('git', ['ls-files', 'packages/core/src'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(
        file =>
          folders.test(file) &&
          globs.some(glob => glob.test(file)) &&
          POINTER.test(read(file)),
      );
    expect(moving.filter(file => !LEFT_OUT.includes(file))).toEqual([
      ...FIREFOX_HOVER_SPECS,
    ]);
  });

  it('is the list the Firefox project in playwright.config.ts runs', () => {
    const config = read('playwright.config.ts');
    expect(config).toMatch(
      /\{\s*name: 'firefox',\s*testMatch: \[\.\.\.FIREFOX_HOVER_SPECS\],\s*use: \{\.\.\.devices\['Desktop Firefox'\]\},?\s*\}/,
    );
    expect(config).toMatch(
      /import \{[^}]*\bFIREFOX_HOVER_SPECS\b[^}]*\} from '\.\/\.github\/scripts\/lib\/a11y-spec-files\.mjs'/s,
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme module's declared color modes, read without running it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {declaredColorModes} from './color-modes.mjs';
import {builtColorMode} from './theme-imports.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-color-modes-'));
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

/** @param {string} name @param {string} text */
const put = (name, text) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
};

describe('declaredColorModes', () => {
  it('reads one mode, both modes, or none', () => {
    expect(declaredColorModes(put('one.js', "export const t = {name: 'a'};\nexport const colorModes = ['light'];\n"))).toBe('light');
    expect(declaredColorModes(put('both.js', 'export const t = {};\nexport const colorModes = ["light", "dark"];\n'))).toBe('both');
    expect(declaredColorModes(put('none.js', 'export const t = {};\n'))).toBeNull();
    expect(declaredColorModes(put('odd.js', "export const colorModes = ['light', 'light'];\n"))).toBeNull();
    expect(declaredColorModes(put('other.js', "export const colorModes = ['dim'];\n"))).toBeNull();
  });

  it('follows a module that re-exports them, and never runs it', () => {
    put('built.js', "export const t = {name: 'b'};\nexport const colorModes = ['dark'];\n");
    expect(declaredColorModes(put('entry.js', "throw new Error('ran');\nexport * from './built.js';\n"))).toBe('dark');
  });

  it('leaves builtColorMode to one mode only', () => {
    expect(builtColorMode(path.join(dir, 'one.js'))).toEqual({mode: 'light'});
    expect(builtColorMode(path.join(dir, 'both.js'))).toEqual({});
  });
});

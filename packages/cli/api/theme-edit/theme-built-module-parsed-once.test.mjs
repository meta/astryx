// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor reads the theme's built module, settings and base for
 * every part and scope a change touches: each text is parsed once, and a
 * file whose text changed is parsed again, so what is read always matches
 * the file.
 */

import {describe, expect, it} from 'vitest';
import {parsedModule} from './_settings.mjs';

describe('a module the editor reads', () => {
  it('is parsed once for each text, and again when its text changes', () => {
    const text = "export const t = {tokens: {'--a': 'red'}};\n";
    const first = parsedModule(text);
    expect(parsedModule(text)).toBe(first);
    const changed = parsedModule(text.replace('red', 'blue'));
    expect(changed).not.toBe(first);
    expect(JSON.stringify(changed.program.body[0])).toContain('blue');
  });

  it('keeps only the last few texts', () => {
    const first = parsedModule('export const a = 1;\n');
    for (let i = 0; i < 20; i++) parsedModule(`export const b${i} = ${i};\n`);
    expect(parsedModule('export const a = 1;\n')).not.toBe(first);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shared import scanner reads a module as its file type writes it:
 * a `.ts` file without JSX (`<T>value` is a type assertion), a `.tsx` file
 * with it.
 */

import {describe, expect, it} from 'vitest';
import {moduleImports} from './embedded-imports.mjs';

const specifiers = (/** @type {string} */ source, /** @type {string} */ file) =>
  (moduleImports(source, file) ?? []).map(each => each.specifier);

describe('moduleImports', () => {
  it('reads a .ts type assertion as one, so the imports after it are found', () => {
    const source = `const size = <number>16;\nimport {a} from './a';\nexport {b} from './b';\n`;
    expect(specifiers(source, 'icons.ts')).toEqual(['./a', './b']);
    expect(specifiers(source, 'icons.mts')).toEqual(['./a', './b']);
  });

  it('reads JSX in a .tsx file', () => {
    const source = `import {a} from './a';\nexport const icon = <svg width={16} />;\nimport {b} from './b';\n`;
    expect(specifiers(source, 'icons.tsx')).toEqual(['./a', './b']);
  });

  it('marks a type-only import', () => {
    const records = moduleImports(
      `import type {T} from './types';\nimport {a} from './a';\n`,
      'icons.ts',
    );
    expect(records?.map(each => [each.specifier, each.typeOnly])).toEqual([
      ['./types', true],
      ['./a', false],
    ]);
  });
});

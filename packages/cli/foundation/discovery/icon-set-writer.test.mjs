// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Icon ids from export names (AST-084): a dimension stays one word. */

import {describe, expect, it} from 'vitest';
import {generatedModuleText, iconIdOf} from './icon-set-writer.mjs';

describe('iconIdOf', () => {
  it.each([
    ['XMarkIcon', 'x-mark'],
    ['Trash2', 'trash-2'],
    ['ArrowUpDown', 'arrow-up-down'],
    ['Squares2X2Icon', 'squares-2x2'],
    ['Grid2x2', 'grid-2x2'],
    ['Grid2X2Check', 'grid-2x2-check'],
    ['Grid3x3', 'grid-3x3'],
    ['Tally5', 'tally-5'],
    ['H1Icon', 'h1'],
    ['Box', 'box'],
    ['CalendarX2', 'calendar-x-2'],
    ['MapPinXInside', 'map-pin-x-inside'],
    ['Heading1', 'heading-1'],
  ])('%s → %s', (name, id) => {
    expect(iconIdOf(name)).toBe(id);
  });
});

describe('generatedModuleText over a large library', () => {
  it('writes twenty thousand icons in one pass, and rewrites them unchanged', () => {
    const icons = Array.from({length: 20000}, (_, index) => ({
      name: `Glyph${index}Icon`,
      from: '@acme/big-library',
      source: `Glyph${index}Outline24Icon`,
      adapt: false,
    }));
    const data = /** @type {any} */ ({
      schemaVersion: 1,
      module: '@acme/big-icons',
      icons: [],
      map: {},
    });
    const started = Date.now();
    const first = generatedModuleText(
      '/pkg',
      'big.generated.js',
      null,
      data,
      icons,
    );
    const again = generatedModuleText(
      '/pkg',
      'big.generated.js',
      first.js,
      data,
      icons,
    );
    // Quadratic matching took minutes here; a single pass takes well under
    // a second.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(again.js).toBe(first.js);
    expect(first.js).toContain(
      "export {Glyph19999Outline24Icon as Glyph19999Icon} from '@acme/big-library';",
    );
  });
});

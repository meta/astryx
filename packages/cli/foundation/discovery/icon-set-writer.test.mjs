// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Icon ids from export names (AST-084): a dimension stays one word. */

import {describe, expect, it} from 'vitest';
import {iconIdOf} from './icon-set-writer.mjs';

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

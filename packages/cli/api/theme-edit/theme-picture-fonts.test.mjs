// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A picture names a font stack this machine has none of the families for:
 * headings set in Georgia, then serif, on a system with no Georgia are
 * drawn in its font for serif, and the result names it.
 */

import {describe, expect, it} from 'vitest';
import {pictureFontNotes} from './_preview.mjs';
import {FONT_PROBE_PREFIX} from '../../foundation/render/font-probe.mjs';

/** @param {object} probe */
const printed = probe => `${FONT_PROBE_PREFIX}${JSON.stringify(probe)}\n`;

describe('the fonts a picture drew its text in', () => {
  it('names headings drawn in a font that is none of their stack', () => {
    const notes = pictureFontNotes(
      printed({
        heading: {
          stack: ['Georgia', 'Times New Roman', 'serif'],
          shown: 'DejaVu Sans',
        },
        body: {stack: ['Figtree', 'Arial', 'sans-serif'], shown: 'Noto Sans'},
      }),
    );
    expect(notes).toEqual([
      'this machine has none of Georgia, Times New Roman, so the pictures draw the headings in DejaVu Sans, its font for serif; a system with Georgia shows them as set (an open font with its package installed shows everywhere, the pictures included)',
    ]);
  });

  it('says nothing when a family of the stack is drawn, for a sans-serif stack, or when nothing was printed', () => {
    expect(
      pictureFontNotes(
        printed({
          heading: {stack: ['Georgia', 'serif'], shown: 'Georgia'},
          body: {stack: ['Figtree', 'sans-serif'], shown: 'Noto Sans'},
        }),
      ),
    ).toEqual([]);
    expect(pictureFontNotes('')).toEqual([]);
    expect(pictureFontNotes(`${FONT_PROBE_PREFIX}not json\n`)).toEqual([]);
  });
});

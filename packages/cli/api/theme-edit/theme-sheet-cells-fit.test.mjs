// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sheet's cells are never narrower than what they hold (a
 * calendar, a stepper, a toolbar, an overlay drawn open), so nothing is cut
 * at a cell's edge, and a panel over the page is drawn whole at its cell's
 * width.
 */

import {describe, expect, it} from 'vitest';
import {SHEET_CSS} from './_catalog.mjs';

describe('a sheet cell', () => {
  it('is never narrower than what it holds, and wraps with the others', () => {
    expect(SHEET_CSS).toContain(
      '.cs-sheet{display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px;padding:14px}',
    );
    expect(SHEET_CSS).toContain(
      '.cs-sheet>.cs-cell{flex:1 1 360px;min-width:min-content;max-width:100%;box-sizing:border-box}',
    );
    expect(SHEET_CSS).toMatch(/\.cs-item\{[^}]*min-width:min-content/);
    // An overlay drawn open keeps its own width: its cell grows to it.
    expect(SHEET_CSS).not.toMatch(
      /\.cs-cell \[popover\]\[data-astryx-layer-root\]\{[^}]*max-width:100%/,
    );
    expect(SHEET_CSS).not.toMatch(/grid-template-columns:repeat\(3/);
  });

  it("draws a panel over the page whole at its cell's width, never past the sheet's edge", () => {
    // (A bottom sheet, a lightbox or an open mobile nav sizes itself from
    // the window: its cell takes its share of the row, never the window's
    // width.)
    expect(SHEET_CSS).toContain(
      '.cs-sheet>.cs-cell:has(dialog),.cs-cell:has(dialog) .cs-item{min-width:0}',
    );
    expect(SHEET_CSS).toMatch(/\.cs-cell dialog\{[^}]*max-width:100%/);
    // On the overlays page a panel is drawn at least as wide as a column
    // of five, and a part that needs a row's width keeps its row.
    expect(SHEET_CSS).toContain(
      '.cs-section-overlays .cs-open-group .cs-sheet>.cs-cell:has(dialog){flex-basis:240px}',
    );
    expect(SHEET_CSS).toContain(
      '.cs-section-overlays .cs-open-group .cs-sheet>.cs-cell:has(table,pre,.astryx-app-shell){flex-basis:100%}',
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A sheet item whose text a part cuts with an ellipsis when narrow (a
 * stepper's step names, a section heading), or that holds a row that
 * scrolls sideways (a carousel's slides), grows by what it lacks, up to the
 * room an item has in a cell as wide as the sheet's content box, before its
 * picture, so no cell runs past the sheet; both browsers run it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {FIT_CELLS} from '../../foundation/render/picture-window.mjs';

/**
 * A sheet item stand-in, its width and its texts' widths, in px.
 * @param {number} width
 * @param {Array<{scroll: number, client: number, ellipsis: boolean, scrolls?: boolean}>} texts
 */
function item(width, texts) {
  const self = {
    style: /** @type {Record<string, string>} */ ({}),
    getBoundingClientRect: () => ({
      width: Math.max(width, parseFloat(self.style.minWidth ?? '0') || 0),
    }),
    // A sheet 1200px wide with 14px of padding a side, and a cell with
    // 10px of padding and a 1px border a side: 1150px of room for an item.
    closest: (/** @type {string} */ selector) =>
      selector === '.cs-sheet'
        ? {clientWidth: 1200, sides: {padding: 14}}
        : {sides: {padding: 10, border: 1}},
    querySelectorAll: () =>
      texts.map(t => ({
        scrollWidth: t.scroll,
        // Text gets what the item gains.
        get clientWidth() {
          return Math.min(
            t.scroll,
            t.client + (self.getBoundingClientRect().width - width),
          );
        },
        ellipsis: t.ellipsis,
        scrolls: t.scrolls ?? false,
      })),
  };
  return self;
}

/** @param {any[]} items */
function run(items) {
  const document = {querySelectorAll: () => items};
  const getComputedStyle = (/** @type {any} */ el) => ({
    textOverflow: el.ellipsis ? 'ellipsis' : 'clip',
    overflowX: el.scrolls ? 'auto' : 'visible',
    paddingLeft: `${el.sides?.padding ?? 0}px`,
    paddingRight: `${el.sides?.padding ?? 0}px`,
    borderLeftWidth: `${el.sides?.border ?? 0}px`,
    borderRightWidth: `${el.sides?.border ?? 0}px`,
    marginLeft: '0px',
    marginRight: '0px',
  });
  new Function('document', 'getComputedStyle', FIT_CELLS)(
    document,
    getComputedStyle,
  );
}

describe('text a part cuts when narrow', () => {
  it('gets the room it needs, up to the room inside the sheet', () => {
    const stepper = item(240, [{scroll: 92, client: 52, ellipsis: true}]);
    const wide = item(240, [{scroll: 2000, client: 100, ellipsis: true}]);
    const clipped = item(240, [{scroll: 400, client: 100, ellipsis: false}]);
    const whole = item(240, [{scroll: 80, client: 80, ellipsis: true}]);
    // A label only a screen reader reads: drawn in no width, never cut.
    const hidden = item(240, [{scroll: 107, client: 0, ellipsis: true}]);
    run([stepper, wide, clipped, whole, hidden]);
    expect(stepper.style.minWidth).toBe('281px');
    // Never past the sheet's content box: the cell's padding and border fit
    // inside it.
    expect(wide.style.minWidth).toBe('1150px');
    // Text clipped with no ellipsis, or drawn whole, is left as it is.
    expect(clipped.style.minWidth).toBeUndefined();
    expect(whole.style.minWidth).toBeUndefined();
    expect(hidden.style.minWidth).toBeUndefined();
  });

  it('a row that scrolls sideways shows every item', () => {
    // Three slides 312 px wide in a 300 px scroller: the third is cut.
    const carousel = item(330, [
      {scroll: 312, client: 300, ellipsis: false, scrolls: true},
    ]);
    run([carousel]);
    expect(carousel.style.minWidth).toBe('343px');
  });

  it('is run by both browsers before the picture', () => {
    const dir = path.resolve(import.meta.dirname, '../../foundation/render');
    for (const file of ['picture-chrome.mjs', 'picture-playwright.mjs'])
      expect(fs.readFileSync(path.join(dir, file), 'utf8')).toMatch(
        /FIT_CELLS[\s\S]*FIT_CELLS/,
      );
  });
});

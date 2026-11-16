// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A sheet item whose text a part cuts with an ellipsis when narrow (a
 * stepper's step names, a section heading) grows by what the text lacks,
 * up to the sheet's width, before its picture; both browsers run it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {FIT_CELLS} from '../../foundation/render/picture-window.mjs';

/**
 * A sheet item stand-in, its width and its texts' widths, in px.
 * @param {number} width
 * @param {Array<{scroll: number, client: number, ellipsis: boolean}>} texts
 */
function item(width, texts) {
  const self = {
    style: /** @type {Record<string, string>} */ ({}),
    getBoundingClientRect: () => ({
      width: Math.max(width, parseFloat(self.style.minWidth ?? '0') || 0),
    }),
    closest: () => ({clientWidth: 1200}),
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
      })),
  };
  return self;
}

/** @param {any[]} items */
function run(items) {
  const document = {querySelectorAll: () => items};
  const getComputedStyle = (/** @type {any} */ el) => ({
    textOverflow: el.ellipsis ? 'ellipsis' : 'clip',
  });
  new Function('document', 'getComputedStyle', FIT_CELLS)(
    document,
    getComputedStyle,
  );
}

describe('text a part cuts when narrow', () => {
  it('gets the room it needs, up to the sheet width', () => {
    const stepper = item(240, [{scroll: 92, client: 52, ellipsis: true}]);
    const wide = item(240, [{scroll: 2000, client: 100, ellipsis: true}]);
    const clipped = item(240, [{scroll: 400, client: 100, ellipsis: false}]);
    const whole = item(240, [{scroll: 80, client: 80, ellipsis: true}]);
    // A label only a screen reader reads: drawn in no width, never cut.
    const hidden = item(240, [{scroll: 107, client: 0, ellipsis: true}]);
    run([stepper, wide, clipped, whole, hidden]);
    expect(stepper.style.minWidth).toBe('281px');
    expect(wide.style.minWidth).toBe('1200px');
    // Text clipped with no ellipsis, or drawn whole, is left as it is.
    expect(clipped.style.minWidth).toBeUndefined();
    expect(whole.style.minWidth).toBeUndefined();
    expect(hidden.style.minWidth).toBeUndefined();
  });

  it('is run by both browsers before the picture', () => {
    const dir = path.resolve(import.meta.dirname, '../../foundation/render');
    for (const file of ['picture-chrome.mjs', 'picture-playwright.mjs'])
      expect(fs.readFileSync(path.join(dir, file), 'utf8')).toMatch(
        /FIT_CELLS[\s\S]*FIT_CELLS/,
      );
  });
});

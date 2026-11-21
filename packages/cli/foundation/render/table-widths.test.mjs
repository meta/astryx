// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `tableWidths`, run against a stand-in page: it measures
 * each drawn Table's scroll area, in page order, and leaves out a hidden one.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {tableWidths} from './table-widths.mjs';
import {measuredTables} from '../pictures/pictures.mjs';

const realDocument = globalThis.document;
const realStyle = globalThis.getComputedStyle;

afterEach(() => {
  globalThis.document = realDocument;
  globalThis.getComputedStyle = realStyle;
});

/** @param {Array<{scrollWidth: number, clientWidth: number, display?: string}>} wrappers */
function page(wrappers) {
  globalThis.document = /** @type {any} */ ({
    querySelectorAll: (/** @type {string} */ q) => (q === '.astryx-table-scroll-wrapper' ? wrappers : []),
  });
  globalThis.getComputedStyle = /** @type {any} */ ((/** @type {any} */ el) => ({display: el.display ?? 'block', visibility: 'visible'}));
}

describe('tableWidths', () => {
  it('gives each drawn Table its rows width and its shown width, in page order', () => {
    page([
      {scrollWidth: 612, clientWidth: 343},
      {scrollWidth: 900, clientWidth: 0},
      {scrollWidth: 500, clientWidth: 343, display: 'none'},
      {scrollWidth: 343, clientWidth: 343},
    ]);
    expect(tableWidths()).toEqual([
      [612, 343],
      [343, 343],
    ]);
  });
});

describe('measuredTables', () => {
  it('reads the line a picture script prints, and nothing from a line that does not read', () => {
    expect(measuredTables('astryx-table-widths:[[612,343]]\ntaken')).toEqual({tables: [[612, 343]]});
    expect(measuredTables('astryx-table-widths:not json')).toEqual({});
    expect(measuredTables('taken')).toEqual({});
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A sheet cell that grows for text a part cuts (FIT_CELLS) stays
 * inside the sheet's content box, so a family's picture keeps the window's
 * width and a tall one is still cut into pictures. Read from a real browser
 * laying out the sheet's own styles.
 */

/* global document, getComputedStyle */

import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {SHEET_CSS} from './_catalog.mjs';
import {
  FIT_CELLS,
  PICTURE_WINDOW,
} from '../../foundation/render/picture-window.mjs';

/** A Chrome or Chromium on PATH, or undefined (Playwright's own). */
const chrome = (() => {
  for (const name of [
    'chromium-browser',
    'chromium',
    'google-chrome',
    'google-chrome-stable',
    'chrome',
  ]) {
    const r = spawnSync('which', [name], {encoding: 'utf8'});
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return undefined;
})();

/** @type {any} */
let browser = null;
let why = '';

beforeAll(async () => {
  try {
    const {chromium} = await import('playwright');
    browser = await chromium.launch(chrome ? {executablePath: chrome} : {});
  } catch (e) {
    why = String(/** @type {any} */ (e)?.message ?? e).split('\n')[0];
  }
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

/**
 * A cell whose part cuts a long line of text with an ellipsis: the part has
 * a width of its own, so growing the item never draws the text whole, and
 * the item grows as far as the room allows.
 */
const PAGE = `<!doctype html><html><head><style>${SHEET_CSS}</style></head><body>
<div class="cs-sheet">
  <div class="cs-cell"><div class="cs-name">Cut</div><div class="cs-row"><div class="cs-item">
    <div style="width:300px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${'A long label that a narrow part cuts short. '.repeat(40)}</div>
  </div></div></div>
  <div class="cs-cell"><div class="cs-name">Next</div><div class="cs-row"><div class="cs-item">x</div></div></div>
</div></body></html>`;

describe('a sheet cell grown for cut text', () => {
  it('stays inside the sheet, so the page keeps the window width', async ctx => {
    if (!browser) {
      console.warn(`skipped: no browser (${why})`);
      return ctx.skip();
    }
    const page = await browser.newPage({viewport: PICTURE_WINDOW});
    await page.setContent(PAGE);
    await page.evaluate(FIT_CELLS);
    const r = await page.evaluate(() => {
      const sheet = /** @type {HTMLElement} */ (
        document.querySelector('.cs-sheet')
      );
      const s = getComputedStyle(sheet);
      const box = sheet.getBoundingClientRect();
      return {
        grown: /** @type {HTMLElement} */ (document.querySelector('.cs-item'))
          .style.minWidth,
        contentRight: box.right - parseFloat(s.paddingRight),
        cells: [...document.querySelectorAll('.cs-cell')].map(
          c => c.getBoundingClientRect().right,
        ),
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    await page.close();
    // The text needs more than the sheet has: the item grows to the room
    // there is, no further.
    expect(r.grown).not.toBe('');
    for (const right of r.cells)
      expect(right).toBeLessThanOrEqual(r.contentRight + 0.5);
    expect(r.pageWidth).toBe(PICTURE_WINDOW.width);
  }, 120_000);
});

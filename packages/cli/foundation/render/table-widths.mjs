// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How far each drawn Table scrolls sideways on a picture's page,
 * measured in the page.
 * @input None: `tableWidths` runs in the page the picture is taken of.
 * @output `tableWidths`: for each Table drawn, in page order, the width of
 *   its rows and the width it shows; `TABLE_WIDTHS_PREFIX`, the line prefix a
 *   picture script prints it after.
 * @position run by picture-chrome.mjs and picture-playwright.mjs for a job
 *   that asks for it, once the page is drawn as the picture shows it; read
 *   back by `takePictures` in foundation/pictures/pictures.mjs. An export's
 *   phone picture uses it to name a Table that a phone has to swipe.
 */

/* global document, getComputedStyle -- tableWidths runs in the page */

/** The line prefix a picture script prints the measurement after. */
export const TABLE_WIDTHS_PREFIX = 'astryx-table-widths:';

/**
 * The width of each drawn Table's rows and the width its scroll area shows,
 * in page order, to the whole pixel. A Table that is not drawn (no box,
 * hidden, `display: none`) is left out, so the order matches the Tables the
 * picture shows.
 * Runs in the page: it uses nothing from outside its own body.
 * @returns {Array<[number, number]>} each `[rows width, shown width]`
 */
export function tableWidths() {
  /** @type {Array<[number, number]>} */
  const out = [];
  for (const el of document.querySelectorAll('.astryx-table-scroll-wrapper')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible') continue;
    if (!el.clientWidth) continue;
    out.push([el.scrollWidth, el.clientWidth]);
  }
  return out;
}

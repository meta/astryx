// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The size of each drawn Astryx part on a picture's page, measured in
 * the page.
 * @input None: `partBoxes` runs in the page the picture is taken of.
 * @output `partBoxes`: for each part named, the width and height of every
 *   element drawn with its `astryx-<part>` class, in page order;
 *   `PART_BOXES_PREFIX`, the line prefix a picture script prints it after.
 * @position run by picture-chrome.mjs and picture-playwright.mjs for a job
 *   that names parts to measure, once the page is drawn as the picture shows
 *   it; read back by `screenshots` in api/theme-edit/_preview.mjs from the
 *   script's stdout. The theme editor compares two pictures' boxes to name
 *   what a change of size moves on the page.
 */

/* global document, getComputedStyle -- partBoxes runs in the page */

/** The line prefix a picture script prints the measurement after. */
export const PART_BOXES_PREFIX = 'astryx-part-boxes:';

/**
 * The width and height of every drawn element of each part named, in page
 * order, to a hundredth of a pixel. An element that is not drawn (no box,
 * hidden, `display: contents`) is left out.
 * Runs in the page: it uses nothing from outside its own body.
 * @param {string[]} parts
 * @returns {Record<string, Array<[number, number]>>}
 */
export function partBoxes(parts) {
  /** @type {Record<string, Array<[number, number]>>} */
  const out = {};
  const round = (/** @type {number} */ n) => Math.round(n * 100) / 100;
  for (const part of parts) {
    out[part] = [];
    for (const el of document.querySelectorAll(`.astryx-${part}`)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'contents' || cs.visibility !== 'visible') continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      out[part].push([round(r.width), round(r.height)]);
    }
  }
  return out;
}

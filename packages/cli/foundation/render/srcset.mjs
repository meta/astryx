// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The candidates of a `srcset` value, read the way a browser reads them.
 * @input A `srcset` attribute or `srcSet` prop value.
 * @output Its candidates (an address and its descriptors), and the value
 *   written back from candidates.
 * @position Shared by the render's markup pass and its pass over the page's
 *   code (page-worker.mjs, render-page.mjs).
 */

/**
 * @typedef {{url: string, descriptor: string}} SrcsetCandidate
 */

/**
 * The candidates a `srcset` value lists. An address ends only at whitespace,
 * so one that holds commas (`…/c_fill,w_400/a.png`) stays whole; a comma
 * right after an address, or one outside parentheses in the descriptors,
 * ends the candidate.
 * @param {string} value
 * @returns {SrcsetCandidate[]}
 */
export function parseSrcset(value) {
  /** @type {SrcsetCandidate[]} */
  const candidates = [];
  const space = (/** @type {string} */ c) => /\s/.test(c);
  let i = 0;
  while (i < value.length) {
    while (i < value.length && (space(value[i]) || value[i] === ',')) i++;
    if (i >= value.length) break;
    const start = i;
    while (i < value.length && !space(value[i])) i++;
    let url = value.slice(start, i);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      let depth = 0;
      const begin = i;
      while (i < value.length) {
        const c = value[i];
        if (c === '(') depth++;
        else if (c === ')') depth = Math.max(0, depth - 1);
        else if (c === ',' && depth === 0) break;
        i++;
      }
      descriptor = value.slice(begin, i).trim();
      if (value[i] === ',') i++;
    }
    if (url) candidates.push({url, descriptor});
  }
  return candidates;
}

/**
 * A `srcset` value written from candidates.
 * @param {SrcsetCandidate[]} candidates
 */
export function formatSrcset(candidates) {
  return candidates
    .map(({url, descriptor}) => (descriptor ? `${url} ${descriptor}` : url))
    .join(', ');
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's own looks and pieces, read from what Core documents about
 * its components: the values of a numbered look ("display headings").
 * @position api/theme-edit — a leaf with no imports, read by _how-question.mjs
 */

/**
 * Every value of a numbered look family a part draws ("display headings":
 * display-1 to display-3): the values its prop takes, as its component's
 * doc types them, and any more Core's data saw it drawn in. Sorted.
 * @param {string} family the value without its number, "display"
 * @param {string} propType the prop's documented type
 * @param {string[]} drawn the values Core's data saw
 * @returns {string[]}
 */
export function numberedLookValues(family, propType, drawn) {
  const typed = [...propType.matchAll(/'([\w-]+)'/g)].map(x => x[1]);
  return [...new Set([...typed, ...drawn])]
    .filter(v => v.startsWith(`${family}-`) && /-\d+$/.test(v))
    .sort();
}

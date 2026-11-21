// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many of this CLI's icon definitions an icon set a source lists
 * maps, kept beside the item response that shows the set.
 * @input The item leaf records it; the text view reads it.
 * @output `iconSetCoverageOf(response)`: `{mapped, total}`, or null.
 * @position A module of its own so search's discover line, which imports
 *   discover's entry, loads no leaf for it. It never enters discover's JSON.
 */

/** @type {WeakMap<object, {mapped: number, total: number}>} */
const coverageByResponse = new WeakMap();

/**
 * Record the coverage of the icon set an item response shows.
 * @param {object} response
 * @param {{mapped: number, total: number}} coverage
 */
export function setIconSetCoverage(response, coverage) {
  coverageByResponse.set(response, coverage);
}

/**
 * How many of this CLI's icon definitions the icon set an item response
 * shows maps, of how many; null when its source lists no definitions.
 * @param {object} response
 * @returns {{mapped: number, total: number} | null}
 */
export function iconSetCoverageOf(response) {
  return coverageByResponse.get(response) ?? null;
}

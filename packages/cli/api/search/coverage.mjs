// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Internal query-coverage bridge between search ranking and build kits.
 * @input Scored result objects plus matched/total concept counts.
 * @output Module-private metadata access that never changes public result JSON.
 * @position Internal search/build plumbing; not exported from the package API.
 */

/** @type {WeakMap<object, {matched: number, total: number}>} */
const coverageByResult = new WeakMap();

/**
 * @template {object} T
 * @param {T} result
 * @param {number} matched
 * @param {number} total
 * @returns {T}
 */
export function setResultCoverage(result, matched, total) {
  coverageByResult.set(result, {matched, total});
  return result;
}

/**
 * @param {object} result
 * @returns {{matched: number, total: number} | undefined}
 */
export function getResultCoverage(result) {
  return coverageByResult.get(result);
}

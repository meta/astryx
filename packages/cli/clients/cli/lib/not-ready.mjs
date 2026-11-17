// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text tag for a template whose doc sets `isReady: false`.
 *
 * @input a name, and the template's `isReady` from a `--json` result
 * @output the name, with ` (not ready)` after it when the template is not ready
 * @position Used by every command whose result lists or returns a template:
 *   search, build, and template (list, show, skeleton, copy).
 */

/** The words text output puts after an unready template's name or kind. */
export const NOT_READY = '(not ready)';

/**
 * @param {string} name
 * @param {boolean | undefined} isReady
 * @returns {string}
 */
export function markNotReady(name, isReady) {
  return isReady === false ? `${name} ${NOT_READY}` : name;
}

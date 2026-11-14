// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fixed text order for identifiers, paths and other machine text.
 *
 * @input two strings
 * @output a negative number, zero, or a positive number, as `sort` expects
 * @position Shared by every sort and tie-break whose order reaches a
 *   command's answer. `String.prototype.localeCompare` with no locale reads
 *   the host's locale, and with a full ICU build that locale moves names
 *   ("ide" against "IDE", "ch" in Czech, "y" in Lithuanian). This order is the
 *   same on every machine. Pure, so browser-bundled code can use it.
 */

/** @type {(a: string, b: string) => number} */
const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Compare two strings without regard to case first, then with lowercase
 * ahead of uppercase: the order en-US collation gives identifiers, but the
 * same answer on every machine and in every locale. `toLowerCase` never reads
 * the locale. Equal only for identical strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareText(a, b) {
  return byCodeUnits(a.toLowerCase(), b.toLowerCase()) || byCodeUnits(b, a);
}

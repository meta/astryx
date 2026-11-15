// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fixed text order for identifiers, names, paths and other machine
 * text.
 *
 * @input two strings
 * @output a negative number, zero, or a positive number, as `sort` expects
 * @position Shared by every sort and tie-break whose order reaches a
 *   command's answer. `String.prototype.localeCompare` with no locale reads
 *   the host's locale, and with a full ICU build that locale moves names
 *   ("ch" in Czech, the Hawaiian alphabet). This order never reads a locale,
 *   so it is the same on every machine. For the names the CLI sorts it
 *   matches the order an English host gives. Pure, so browser-bundled code
 *   can use it.
 */

/**
 * Each character's class, in the order of the Unicode root collation's
 * primary groups: spaces, then punctuation, then symbols, then digits, then
 * letters, then everything else.
 */
const CLASSES = [/\p{Z}/u, /\p{P}/u, /\p{S}/u, /\p{N}/u, /\p{L}/u];

/** @type {Map<number, number>} */
const classOf = new Map();

/** @param {number} code */
function characterClass(code) {
  let value = classOf.get(code);
  if (value === undefined) {
    const char = String.fromCodePoint(code);
    value = CLASSES.findIndex(pattern => pattern.test(char));
    if (value < 0) value = CLASSES.length;
    classOf.set(code, value);
  }
  return value;
}

/** @type {(a: string, b: string) => number} */
const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Compare two strings character by character without regard to case: first
 * by each character's class, then by its code point. A string that is a
 * prefix of another comes first. Strings that differ only in case put
 * lowercase first. Equal only for identical strings. `toLowerCase` never
 * reads the locale.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareText(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const cx = /** @type {number} */ (x.codePointAt(i));
    const cy = /** @type {number} */ (y.codePointAt(j));
    if (cx !== cy) {
      return characterClass(cx) - characterClass(cy) || cx - cy;
    }
    i += cx > 0xffff ? 2 : 1;
    j += cy > 0xffff ? 2 : 1;
  }
  return x.length - i - (y.length - j) || byCodeUnits(b, a);
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unicodeDigits.ts
 * @input Text in any digit script
 * @output Exports INVISIBLE_CHARS, digitValue, and toAsciiDigits
 * @position Internal shared utility for the locale-aware parsers
 *   (NumberInput/numberParser.ts, utils/timeFormat.ts); not part of the
 *   public surface
 *
 * Locale-independent: a digit's value is a Unicode property, not a locale
 * preference, so this needs no Intl and no locale.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/utils/unicodeDigits.test.ts
 */

// Built at runtime rather than written as a literal: Babel's
// transform-unicode-property-regex rewrites a `\p{...}` regex LITERAL into an
// enumerated character class, and the copy bundled with Next rejects the
// General_Category short names, failing the sandbox build. Property escapes are
// ES2018 and need no transform in any browser this package supports.
const DECIMAL_DIGIT = new RegExp('\\p{Nd}', 'u');

/**
 * Zero-width joiners, bidi marks and isolates (which Intl writes around RTL
 * numbers and day periods), and the BOM Excel prepends.
 */
export const INVISIBLE_CHARS =
  /[\u200B-\u200D\u200E\u200F\u061C\u2066-\u2069\uFEFF]/g;

/**
 * Value of any Unicode decimal digit. Each digit script lays its ten digits
 * out consecutively, so walking back to the script's zero derives the value
 * for Arabic-Indic, Devanagari, full-width and the rest without shipping a
 * table of them. Returns null for a non-digit, and in the one shape the walk
 * cannot resolve: two digit blocks adjacent in code space (the mathematical
 * alphanumerics).
 */
export function digitValue(char: string): number | null {
  const codePoint = char.codePointAt(0);
  if (codePoint == null || !DECIMAL_DIGIT.test(char)) {
    return null;
  }
  for (let zero = codePoint; codePoint - zero < 10; zero--) {
    if (!DECIMAL_DIGIT.test(String.fromCodePoint(zero - 1))) {
      return codePoint - zero;
    }
  }
  return null;
}

/**
 * Rewrites every decimal digit as its ASCII digit, leaving other characters
 * alone. Returns null when a digit's value cannot be resolved.
 */
export function toAsciiDigits(text: string): string | null {
  let out = '';
  for (const char of text) {
    if (!DECIMAL_DIGIT.test(char)) {
      out += char;
      continue;
    }
    const value = digitValue(char);
    if (value == null) {
      return null;
    }
    out += String(value);
  }
  return out;
}

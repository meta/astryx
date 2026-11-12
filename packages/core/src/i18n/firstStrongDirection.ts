// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file firstStrongDirection.ts
 * @input A string of text
 * @output 'ltr' | 'rtl' | null — the direction of the text's first strongly
 *   directional character, or null when it has none
 * @position Shared classifier for components that give a block of prose the
 *   direction of its own text (Markdown blocks). Server-safe: it reads no
 *   context.
 */

// Each expression with a Unicode property escape is built at runtime: a
// source build may rewrite a regular expression literal with one, and the
// Babel copy that Next.js bundles has no Unicode data to do that.

/**
 * The strongly right-to-left characters of the Unicode Bidirectional
 * Algorithm: Bidi_Class `R` and `AL`. The living scripts are named. The two
 * ranges cover the historic right-to-left scripts in the Supplementary
 * Multilingual Plane, which have no script escapes that every engine knows.
 */
const STRONG_RTL = new RegExp(
  String.raw`[\p{Script=Adlam}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Mandaic}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Syriac}\p{Script=Thaana}\u200F\u061C\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]`,
  'u',
);

/**
 * The weak characters of the Arabic script: its digits, the number signs
 * before them, and the currency and per-cent marks beside them. They are
 * Bidi_Class `AN`, `EN` or `ET`, so the scan skips them. NKo and Adlam digits
 * are Bidi_Class `R` and are not here.
 */
const WEAK_ARABIC_NUMBER =
  /[\u0600-\u0605\u0609\u060A\u0660-\u0669\u066A-\u066C\u06DD\u06F0-\u06F9\u0890\u0891\u08E2]/u;

/**
 * Bidi_Class `L`: every other letter, the letter numbers (`\p{Letter}` does
 * not include them), and the left-to-right mark. Digits, punctuation and
 * symbols are not here, so the scan skips them.
 */
const STRONG_LTR = new RegExp(String.raw`[\p{Letter}\p{Nl}\u200E]`, 'u');

/**
 * Bidi_Class `NSM`: a combining mark takes the direction of its base
 * character. A mark has its base letter's script, so without this check a
 * leading Hebrew point would read as right-to-left.
 */
const COMBINING_MARK = new RegExp(String.raw`\p{Mark}`, 'u');

/** Whether the text holds a strongly right-to-left character anywhere. */
export function hasStrongRightToLeft(text: string): boolean {
  for (const character of text) {
    if (STRONG_RTL.test(character)) {
      return true;
    }
  }
  return false;
}

/**
 * Rules P2 and P3 of the Unicode Bidirectional Algorithm: the direction of
 * the first strongly directional character, or null when there is none. The
 * loop reads whole code points, so a surrogate pair counts as one character.
 */
export function firstStrongDirection(text: string): 'ltr' | 'rtl' | null {
  for (const character of text) {
    if (COMBINING_MARK.test(character) || WEAK_ARABIC_NUMBER.test(character)) {
      continue;
    }
    if (STRONG_RTL.test(character)) {
      return 'rtl';
    }
    if (STRONG_LTR.test(character)) {
      return 'ltr';
    }
  }
  return null;
}

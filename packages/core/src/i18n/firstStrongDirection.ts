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
 *
 * JavaScript has no `\p{Bidi_Class=...}` escape, so these sets approximate
 * that property from script and category, and name the characters where the
 * two disagree. Four `AL` characters have script `Common`: the semicolon,
 * the letter mark, the question mark, and tatweel. Tatweel is also a
 * modifier letter, so without it the scan reads an Arabic word that starts
 * with one as left-to-right.
 */
const STRONG_RTL = new RegExp(
  String.raw`[\p{Script=Adlam}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Mandaic}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Syriac}\p{Script=Thaana}\u061B\u061C\u061F\u0640\u200F\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]`,
  'u',
);

/**
 * The characters the scan passes over inside the right-to-left scripts:
 * Bidi_Class `AN`, `EN`, `ET` and `ON`, none of which decides a direction.
 *
 * The first group is the Arabic script's own: its digits, the number signs
 * before them, and the currency and per-cent marks beside them.
 *
 * The rest sit inside the two supplementary ranges above, which are drawn
 * around whole planes and so sweep up every digit and mark those scripts
 * carry as well as their letters: the Phoenician word separator, Avestan
 * punctuation, the Hanifi Rohingya, Garay, Yezidi and Rumi digits, a Garay
 * mark, and the Arabic mathematical operators. Each one is verified against
 * the browser's own implementation of the algorithm in
 * firstStrongDirection.test.ts.
 *
 * Membership here is about Bidi_Class, never about looking like a number.
 * The Indic Siyaq and Ottoman Siyaq numerals sit beside Rumi and are
 * Bidi_Class `AL`, so they stay strong; NKo and Adlam digits are `R`, so
 * they do too.
 */
const WEAK_NUMBER_OR_NEUTRAL =
  /[0-9\u0600-\u0605\u0609\u060A\u0660-\u0669\u066A-\u066C\u06DD\u06F0-\u06F9\u0890\u0891\u08E2\uFF10-\uFF19\u{1091F}\u{10B39}-\u{10B3F}\u{10D30}-\u{10D39}\u{10D40}-\u{10D49}\u{10D6E}\u{10E60}-\u{10E7E}\u{10ED0}-\u{10ED8}\u{1CCF0}-\u{1CCF9}\u{1D7CE}-\u{1D7FF}\u{1EEF0}\u{1EEF1}\u{1FBF0}-\u{1FBF9}]/u;

/**
 * Bidi_Class `L`: every other letter, the letter numbers (`\p{Letter}` does
 * not include them), the left-to-right mark, and the decimal digits.
 *
 * Most scripts' digits are `L` — Devanagari, Bengali, Tamil, Thai and the
 * rest — so a line opening with them reads left-to-right. The digits that
 * are not are read before this: the European ones are `EN` and the
 * Arabic-Indic ones `AN`, both in the weak set above, and NKo's and Adlam's
 * are `R`, matched as their own scripts. Punctuation and symbols are not
 * here, so the scan passes over them.
 */
const STRONG_LTR = new RegExp(String.raw`[\p{Letter}\p{Nl}\p{Nd}\u200E]`, 'u');

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
    if (
      COMBINING_MARK.test(character) ||
      WEAK_NUMBER_OR_NEUTRAL.test(character)
    ) {
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

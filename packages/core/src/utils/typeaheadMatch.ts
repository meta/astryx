// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file typeaheadMatch.ts
 * @input Plain strings (an item label and the letters a person typed)
 * @output foldForTypeahead, nextTypeaheadBuffer, typeaheadPrefixMatch,
 *   findTypeaheadMatch
 * @position Shared type-to-select matching for useTypeahead, useTreeFocus and
 *   MultiSelector (`architecture:internationalization` INV17)
 *
 * Type-to-select is navigation, not sorting, so it folds the same way in every
 * locale: case, the combining marks canonical decomposition leaves
 * (U+0300–U+036F), six Latin letters with a stroke or bar, and Turkish ı and
 * İ. Typed letters that carry one of those marks prefer an exact match, with
 * case paired the Turkish way (ı with I, İ with i).
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;

// The six stroked or barred Latin letters INV17 folds, in both cases. Turkish
// dotless ı joins them; dotted İ decomposes to I + U+0307 and needs no entry.
const STROKED: Readonly<Record<string, string>> = {
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
  ø: 'o',
  Ø: 'o',
  ħ: 'h',
  Ħ: 'h',
  ŧ: 't',
  Ŧ: 't',
  ƀ: 'b',
  Ƀ: 'b',
  ı: 'i',
};
const STROKED_CHARS = /[đĐłŁøØħĦŧŦƀɃı]/g;
const MARKED_CHARS = /[đĐłŁøØħĦŧŦƀɃıİ]/;

/**
 * Fold text for type-to-select: no case, no combining marks, the six stroked
 * letters and ı as their base letter. Locale-independent by design.
 */
export function foldForTypeahead(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .replace(STROKED_CHARS, c => STROKED[c] ?? c)
      // Recompose what INV17 keeps (a Japanese voiced mark, an Arabic hamza, a
      // Hangul final consonant), so a one-letter prefix does not skip it.
      .normalize('NFC')
      .toLowerCase()
  );
}

/**
 * The type-to-select buffer after one more key, shared by every path so they
 * buffer the same way. Returns null when the key is not a letter to jump to: a
 * lone combining mark typed first. Pressing the same letter again (as folded)
 * cycles, so the buffer stays that one letter instead of growing.
 */
export function nextTypeaheadBuffer(
  buffer: string,
  key: string,
): string | null {
  if (
    buffer.length === 0 &&
    key !== ' ' &&
    foldForTypeahead(key).length === 0
  ) {
    return null;
  }
  const isRepeatSameChar =
    buffer.length > 0 &&
    buffer.split('').every(c => foldForTypeahead(c) === foldForTypeahead(key));
  return isRepeatSameChar ? key : buffer + key;
}

/**
 * Case-fold for the exact-match preference, pairing the Turkish way: I with ı
 * and İ with i. Composed, so an accent typed as its own key counts as one
 * letter, as it does in a composed label.
 */
function exactFold(text: string): string {
  return text
    .normalize('NFC')
    .replace(/I/g, 'ı')
    .replace(/İ/g, 'i')
    .toLowerCase();
}

/** Whether typed letters carry a mark that makes an exact match preferable. */
function hasMark(typed: string): boolean {
  return (
    MARKED_CHARS.test(typed) || /[\u0300-\u036f]/.test(typed.normalize('NFD'))
  );
}

/**
 * Whether `label` starts with `typed` under INV17's fold. `exact` additionally
 * requires the unfolded letters to match (Turkish case pairing).
 */
export function typeaheadPrefixMatch(
  label: string,
  typed: string,
  exact = false,
): boolean {
  const trimmed = label.trim();
  if (exact) {
    return exactFold(trimmed).startsWith(exactFold(typed));
  }
  const foldedTyped = foldForTypeahead(typed);
  // A lone combining mark folds to nothing; it is not a letter to jump to.
  if (foldedTyped.length === 0) {
    return false;
  }
  return foldForTypeahead(trimmed).startsWith(foldedTyped);
}

/**
 * Find the next item whose label matches the typed letters, visiting indexes
 * in `order`. When the typed letters carry a diacritic, a stroked letter, ı or
 * İ, an exact match anywhere in the order wins over a folded one.
 */
export function findTypeaheadMatch(
  order: ReadonlyArray<number>,
  getLabel: (index: number) => string | null | undefined,
  typed: string,
): number {
  const passes = hasMark(typed) ? [true, false] : [false];
  for (const exact of passes) {
    for (const index of order) {
      const label = getLabel(index);
      if (label != null && typeaheadPrefixMatch(label, typed, exact)) {
        return index;
      }
    }
  }
  return -1;
}

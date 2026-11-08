// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {formatEditableNumber, parseLocaleNumber} from './numberParser';

const NBSP = '\u00A0';
const NARROW_NBSP = '\u202F';
const APOSTROPHE = '\u2019';
const MIDDLE_DOT = '\u00B7';

/**
 * The contract, enumerated. A row is `[input, locale, expected]`, and `null`
 * means the field stays visibly invalid rather than committing a guess.
 */
const CORPUS: [string, string, number | null][] = [
  // Grouped — the case this exists for, and it holds in every locale because
  // a repeated separator with three digits after it cannot be a decimal point.
  ['1,234,234,234', 'en-US', 1234234234],
  ['1,234,234,234', 'de-DE', 1234234234],
  ['1,234,234,234', 'fr-FR', 1234234234],
  ['1,234,234,234', 'ar-SA', 1234234234],
  ['1.234.234.234', 'de-DE', 1234234234],
  ['1.234.234.234', 'en-US', 1234234234],
  [`1${NARROW_NBSP}234${NARROW_NBSP}234${NARROW_NBSP}234`, 'fr-FR', 1234234234],
  [`1${NBSP}234${NBSP}234`, 'fr-FR', 1234234],
  [`1${NBSP}234`, 'en-US', 1234],
  [`1${APOSTROPHE}234${APOSTROPHE}234`, 'de-CH', 1234234],
  ["1'234'234", 'de-CH', 1234234],
  ['1,234', 'en-US', 1234],
  ['1,234', 'de-DE', 1.234],

  // Indian lakh grouping, derived from the locale's own group sizes.
  ['12,34,567', 'en-IN', 1234567],
  ['12,34,567', 'en-US', null],

  // Ragged grouping is a typo, not a number: the last group is not three.
  ['1,23,4', 'en-US', null],
  ['1,2345', 'en-US', null],
  ['12 34', 'en-US', null],

  // One separator, one meaning per locale, and no meaning across them.
  ['1,5', 'de-DE', 1.5],
  ['1,5', 'en-US', null],
  ['1.5', 'en-US', 1.5],

  // The machine decimal point reads everywhere: a full stop the locale cannot
  // read as grouping has one meaning left, and refusing it lost a number the
  // person had typed. Where grouping IS well formed the locale still wins.
  ['1.5', 'de-DE', 1.5],
  ['1.5', 'fr-FR', 1.5],
  ['1234.56', 'de-DE', 1234.56],
  ['-3.25', 'fr-FR', -3.25],
  ['0.5', 'de-DE', 0.5],
  ['1.5e3', 'de-DE', 1500],
  ['1.234', 'de-DE', 1234],
  ['1.2345', 'de-DE', 1.2345],
  // The same text in the other comma-decimal locale: fr-FR groups with a
  // space, so a full stop has no grouping reading there and stays the point.
  ['1.234', 'fr-FR', 1.234],

  // Decimals and signs.
  ['1,234.56', 'en-US', 1234.56],
  ['1.234,56', 'de-DE', 1234.56],
  ['1,234.56', 'de-DE', null],
  ['-1,234.56', 'en-US', -1234.56],
  ['+7', 'en-US', 7],
  ['-7', 'en-US', -7],
  ['7-', 'ar-SA', -7],
  ['.5', 'en-US', 0.5],
  ['5.', 'en-US', 5],
  ['-', 'en-US', null],
  ['', 'en-US', null],
  ['   ', 'en-US', null],

  // Spreadsheet cells arrive with their whitespace attached.
  ['  42  ', 'en-US', 42],
  ['\t1,234\n', 'en-US', 1234],
  ['1,234\n5,678', 'en-US', null],

  // Digit scripts, derived from \p{Nd} rather than enumerated.
  ['١٢٣', 'ar-SA', 123],
  ['۱۲۳', 'fa-IR', 123],
  ['१२३', 'hi-IN', 123],
  ['１２３', 'ja-JP', 123],
  ['١,٢٣٤', 'en-US', 1234],
  ['٣٫٥', 'ar-SA', 3.5],

  // Currency decorates the number without changing its magnitude, so the
  // symbol is dropped and the separators still decide. A number written for
  // another locale still refuses.
  ['$1,234.56', 'en-US', 1234.56],
  ['£1,234', 'en-US', 1234],
  ['1.234,56 €', 'de-DE', 1234.56],
  ['1.234,56 €', 'en-US', null],
  ['-$1,234', 'en-US', -1234],

  // A unit suffix is not dropped: `B` and `k` carry magnitude, so guessing
  // which trailing letters are inert is how a wrong number gets committed.
  ['1,234 GB', 'en-US', null],
  ['72°F', 'en-US', null],
  ['1,234 kg', 'en-US', null],

  // Accounting negatives.
  ['(1,234)', 'en-US', -1234],
  ['($1,234.50)', 'en-US', -1234.5],
  ['(1,234', 'en-US', null],
  // The parens already carry the sign; a second one reads two ways.
  ['(-1,234)', 'en-US', null],
  ['(+1,234)', 'en-US', null],

  // Typographic minus signs.
  ['\u22121234', 'en-US', -1234],
  ['\u20131234', 'en-US', -1234],

  // Exponents, including the shape a spreadsheet exports.
  ['1.23E+09', 'en-US', 1230000000],
  ['1.23e9', 'en-US', 1230000000],
  ['1.5e-3', 'en-US', 0.0015],
  ['1e', 'en-US', null],

  // Invisible characters Excel and Sheets attach.
  ['\uFEFF1,234', 'en-US', 1234],
  ['1,234\u200B', 'en-US', 1234],
  ['\u200E1,234', 'en-US', 1234],

  // Junk.
  ['NaN', 'en-US', null],
  ['Infinity', 'en-US', null],
  ['abc', 'en-US', null],
  ['12abc', 'en-US', null],
  ['1/2', 'en-US', null],
  ['1 234 (approx)', 'en-US', null],
  ['--5', 'en-US', null],
  ['1..234', 'en-US', null],

  // Only a character some locale writes between digits is a separator. None of
  // these are numbers, and the last two were refused before only because their
  // final group is the wrong length — luck, not a rule.
  ['123-456-789', 'en-US', null],
  ['1-800-555', 'en-US', null],
  ['555-123-456', 'en-US', null],
  ['1_234_567', 'en-US', null],
  ['1/234/567', 'en-US', null],
  ['1:234:567', 'en-US', null],
  ['1*234*567', 'en-US', null],
  ['800-555-1212', 'en-US', null],
  ['2024-01-15', 'en-US', null],

  // U+00B7 was in the alphabet as the Catalan middle dot. Catalan groups with
  // a full stop, and no locale ICU resolves writes it between digits at all.
  [`1${MIDDLE_DOT}234${MIDDLE_DOT}567`, 'en-US', null],
  [`1${MIDDLE_DOT}234${MIDDLE_DOT}567`, 'ca-ES', null],

  // The field has no percent semantics, so a percent sign is not dropped:
  // committing 45 for `45%` is off by a factor of a hundred.
  ['45%', 'en-US', null],
  ['0.5%', 'en-US', null],
  ['45 %', 'fr-FR', null],
];

describe('parseLocaleNumber', () => {
  it.each(CORPUS)('parses %j in %s', (input, locale, expected) => {
    expect(parseLocaleNumber(input, locale)).toBe(expected);
  });

  it('reads back the grouping every locale writes', () => {
    for (const locale of [
      'en-US',
      'de-DE',
      'fr-FR',
      'de-CH',
      'en-IN',
      'ar-SA',
    ]) {
      const text = new Intl.NumberFormat(locale).format(1234234234);
      expect(parseLocaleNumber(text, locale)).toBe(1234234234);
    }
  });
});

describe('formatEditableNumber', () => {
  it.each([
    [1.5, 'en-US', '1.5'],
    [1.5, 'de-DE', '1,5'],
    [-1234.56, 'fr-FR', '-1234,56'],
    // Only the decimal separator is localized. The digits stay as `String`
    // writes them, which is what the field shows at rest when no `formatValue`
    // is given, so localizing them here would flip the script on focus.
    [3.5, 'ar-SA', '3٫5'],
    // No grouping: the text has to be editable, and a separator the person did
    // not type is one they have to delete.
    [1234234234, 'de-DE', '1234234234'],
    [42, 'de-DE', '42'],
    // What `String` writes for the extremes stays untouched but for the point.
    [1e21, 'de-DE', '1e+21'],
    [1.5e-7, 'de-DE', '1,5e-7'],
  ])('shows %j in %s as %j', (value, locale, expected) => {
    expect(formatEditableNumber(value, locale)).toBe(expected);
  });

  it('round trips through the parser in every locale', () => {
    for (const locale of [
      'en-US',
      'de-DE',
      'fr-FR',
      'de-CH',
      'en-IN',
      'ar-SA',
      'ja-JP',
      'hi-IN',
    ]) {
      for (const value of [
        0, 1, -1, 0.1, 1.5, -0.5, 1234.56, -1234567.125, 123456789,
        3.141592653589793, 1e21, 1.5e-7, -9007199254740991,
      ]) {
        expect(
          parseLocaleNumber(formatEditableNumber(value, locale), locale),
        ).toBe(value);
      }
    }
  });
});

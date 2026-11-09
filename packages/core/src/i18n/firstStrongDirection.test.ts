// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file firstStrongDirection.test.ts
 * @input The shared first-strong classifier
 * @output Proof that it follows Bidi_Class where script and category
 *   membership disagree with it
 * @position Guards the sets in firstStrongDirection.ts, which approximate a
 *   property JavaScript does not expose.
 */

import {describe, it, expect} from 'vitest';
import {firstStrongDirection} from './firstStrongDirection';

describe('firstStrongDirection', () => {
  it('reads the first strongly directional character', () => {
    expect(firstStrongDirection('hello')).toBe('ltr');
    expect(firstStrongDirection('\u05e9\u05dc\u05d5\u05dd')).toBe('rtl');
    expect(firstStrongDirection('\u0645\u0631\u062d\u0628\u0627')).toBe('rtl');
    expect(firstStrongDirection('\u65e5\u672c\u8a9e')).toBe('ltr');
  });

  it('has no direction when the text has no strong character', () => {
    expect(firstStrongDirection('')).toBeNull();
    expect(firstStrongDirection('123 456')).toBeNull();
    expect(firstStrongDirection('\u2014 \u2026 !')).toBeNull();
    expect(firstStrongDirection('\ud83c\udf89\ud83d\udc4d')).toBeNull();
  });

  it('skips the weak characters before a strong one', () => {
    // Emoji and punctuation are neutral, so the Hebrew decides.
    expect(firstStrongDirection('\ud83c\udf89 \u05de\u05d6\u05dc')).toBe('rtl');
    expect(firstStrongDirection('123 \u2014 \u05de\u05d6\u05dc')).toBe('rtl');
    // Arabic-Indic and Persian digits are Bidi_Class AN.
    expect(firstStrongDirection('\u06f1\u06f4\u06f0\u06f3 Annual report')).toBe(
      'ltr',
    );
    expect(firstStrongDirection('\u0661\u0662\u0663 Annual report')).toBe(
      'ltr',
    );
    // The per-cent, per-mille and currency marks are ET or AN.
    expect(firstStrongDirection('\u066a50 off')).toBe('ltr');
    expect(firstStrongDirection('\u066a50 \u062e\u0635\u0645')).toBe('rtl');
    // Bidi_Class CS, not AL.
    expect(firstStrongDirection('\u060c Annual')).toBe('ltr');
  });

  it('treats a combining mark as weak, whatever script it carries', () => {
    // A mark has its base letter's script, so Script=Hebrew matches a point.
    expect(firstStrongDirection('\u05b0Annual report')).toBe('ltr');
    expect(firstStrongDirection('\u05b0')).toBeNull();
    expect(firstStrongDirection('\u064eAnnual report')).toBe('ltr');
    // On a strong base the mark changes nothing.
    expect(firstStrongDirection('\u05e9\u05b8\u05dc\u05d5\u05b9\u05dd')).toBe(
      'rtl',
    );
  });

  it('reads the Arabic marks whose script is Common as strong', () => {
    // Bidi_Class AL with Script=Common. Tatweel is also a modifier letter,
    // so the letter test would otherwise call it left-to-right.
    expect(
      firstStrongDirection('\u0640\u0647\u0627 \u0636\u0645\u064a\u0631'),
    ).toBe('rtl');
    expect(firstStrongDirection('\u0640')).toBe('rtl');
    expect(firstStrongDirection('\u061b Annual')).toBe('rtl');
    expect(firstStrongDirection('\u061f Annual')).toBe('rtl');
  });

  it('reads letter numbers as strong and right-to-left numerals as weak', () => {
    // Bidi_Class L, General_Category Nl, which \p{Letter} does not cover.
    expect(firstStrongDirection('\u2160')).toBe('ltr');
    expect(firstStrongDirection('\u2160\u05e9\u05dc\u05d5\u05dd')).toBe('ltr');
    // Bidi_Class AN, inside the right-to-left planes the strong ranges cover.
    expect(firstStrongDirection('\u{10E60}\u{10E61} Annual report')).toBe(
      'ltr',
    );
    expect(firstStrongDirection('\u{1EC71} Annual')).toBe('ltr');
    expect(firstStrongDirection('\u{1ED01} Annual')).toBe('ltr');
    expect(firstStrongDirection('\u{10E60}')).toBeNull();
    // Still strong in the same planes.
    expect(firstStrongDirection('\u{1E802}')).toBe('rtl');
    expect(firstStrongDirection('\u{1EE01}')).toBe('rtl');
  });

  it('reads right-to-left digits that are Bidi_Class R as strong', () => {
    expect(firstStrongDirection('\u07c0\u07c1\u07c2')).toBe('rtl');
    expect(firstStrongDirection('\u{1E950}\u{1E951}')).toBe('rtl');
  });

  it('classifies a character outside the Basic Multilingual Plane by what it is', () => {
    // A surrogate pair is one character to the scan, not two code units.
    expect(firstStrongDirection('\u{1E900}\u{1E921}')).toBe('rtl');
    expect(firstStrongDirection('\u0800\u0801')).toBe('rtl');
    expect(firstStrongDirection('\u0840\u0841')).toBe('rtl');
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unicodeDigits.test.ts
 * @input Uses vitest and the unicodeDigits helpers
 * @output Unit tests for digit values across scripts
 * @position Testing; validates utils/unicodeDigits.ts
 *
 * SYNC: When unicodeDigits.ts changes, update tests to match new behavior
 */

import {describe, expect, it} from 'vitest';
import {INVISIBLE_CHARS, digitValue, toAsciiDigits} from './unicodeDigits';

describe('digitValue', () => {
  it.each([
    ['7', 7],
    ['٧', 7], // Arabic-Indic
    ['۷', 7], // Extended Arabic-Indic
    ['७', 7], // Devanagari
    ['৭', 7], // Bengali
    ['７', 7], // full-width
  ])('reads %s as %i', (char, value) => {
    expect(digitValue(char)).toBe(value);
  });

  it('returns null for a non-digit', () => {
    expect(digitValue('a')).toBeNull();
    expect(digitValue('')).toBeNull();
  });
});

describe('toAsciiDigits', () => {
  it('rewrites digits and leaves everything else', () => {
    expect(toAsciiDigits('٢:٣٠ م')).toBe('2:30 م');
    expect(toAsciiDigits('१२,३४५.६')).toBe('12,345.6');
  });
});

describe('INVISIBLE_CHARS', () => {
  it('strips bidi marks and zero-width characters', () => {
    expect('\u200F١٢\u061C\uFEFF'.replace(INVISIBLE_CHARS, '')).toBe('١٢');
  });
});

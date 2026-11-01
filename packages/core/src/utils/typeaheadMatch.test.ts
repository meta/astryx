// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file typeaheadMatch.test.ts
 * @input vitest, typeaheadMatch
 * @output INV17 fold and exact-match preference cases
 * @position Testing; `architecture:internationalization` INV17
 */

import {describe, it, expect} from 'vitest';
import {
  findTypeaheadMatch,
  foldForTypeahead,
  typeaheadPrefixMatch,
} from './typeaheadMatch';

function first(labels: ReadonlyArray<string>, typed: string): string | null {
  const index = findTypeaheadMatch(
    labels.map((_, i) => i),
    i => labels[i],
    typed,
  );
  return index >= 0 ? labels[index] : null;
}

describe('typeaheadMatch (INV17)', () => {
  it('ignores combining marks, composed or decomposed', () => {
    expect(typeaheadPrefixMatch('Ánh', 'a')).toBe(true);
    expect(typeaheadPrefixMatch('A\u0301nh', 'a')).toBe(true);
    expect(typeaheadPrefixMatch('Åsa', 'a')).toBe(true);
    expect(typeaheadPrefixMatch('Ñandú', 'n')).toBe(true);
  });

  it.each([
    ['đ', 'Đào', 'd'],
    ['ł', 'Łódź', 'l'],
    ['ø', 'Øystein', 'o'],
    ['ħ', 'Ħamrun', 'h'],
    ['ŧ', 'Ŧara', 't'],
    ['ƀ', 'Ƀorg', 'b'],
  ])('folds the stroked letter %s to its plain letter', (_, label, typed) => {
    expect(typeaheadPrefixMatch(label, typed)).toBe(true);
    expect(typeaheadPrefixMatch(label.toLowerCase(), typed)).toBe(true);
  });

  it('folds Turkish ı and İ to i', () => {
    expect(typeaheadPrefixMatch('Isparta', 'i')).toBe(true);
    expect(typeaheadPrefixMatch('İzmir', 'i')).toBe(true);
    expect(typeaheadPrefixMatch('Isparta', 'ı')).toBe(true);
    expect(typeaheadPrefixMatch('İzmir', 'ı')).toBe(true);
  });

  it('prefers an exact match when the typed letters carry a mark', () => {
    expect(first(['Dung', 'Đào'], 'đ')).toBe('Đào');
    expect(first(['Ana', 'Ánh'], 'á')).toBe('Ánh');
    expect(first(['Dung', 'Đào'], 'd')).toBe('Dung');
  });

  it('pairs case the Turkish way for the exact-match preference', () => {
    expect(first(['İzmir', 'Isparta'], 'ı')).toBe('Isparta');
    expect(first(['Isparta', 'İzmir'], 'İ')).toBe('İzmir');
  });

  it('falls back to the folded match when nothing matches exactly', () => {
    expect(first(['Dung'], 'đ')).toBe('Dung');
  });

  it('never matches on a lone combining mark', () => {
    expect(typeaheadPrefixMatch('Anna', '\u0301')).toBe(false);
    expect(foldForTypeahead('\u0301')).toBe('');
  });

  it('keeps marks outside U+0300–U+036F (Thai tone marks)', () => {
    expect(typeaheadPrefixMatch('ตั้งค่า', 'ตั้ง')).toBe(true);
    expect(typeaheadPrefixMatch('ตัด', 'ตั้ง')).toBe(false);
  });
});

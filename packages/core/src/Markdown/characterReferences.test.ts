// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {decodeMarkdownCharacterReferences} from './characterReferences';
import {parseInline} from './parser';

/** Character reference cases every surface decodes the same way (spec:AST-061 DEC-5). */
const CHARACTER_REFERENCE_CASES: ReadonlyArray<readonly [string, string]> = [
  ['&copy;', '©'],
  ['&#169;', '©'],
  ['&#xA9;', '©'],
  ['&#XA9;', '©'],
  ['&amp;copy;', '&copy;'],
  ['Fish &amp; chips', 'Fish & chips'],
  ['&NotEqualTilde;', '\u2242\u0338'],
  ['&unknown;', '&unknown;'],
  ['&copy', '&copy'],
  ['& copy;', '& copy;'],
  ['&#0;', '\uFFFD'],
  ['&#xD800;', '\uFFFD'],
  ['&#x110000;', '\uFFFD'],
  ['&#12345678;', '&#12345678;'],
  ['a&nbsp;b', 'a\u00A0b'],
  ['no references', 'no references'],
];

describe('decodeMarkdownCharacterReferences (spec:AST-061 DEC-5)', () => {
  it('decodes valid references and leaves everything else as written', () => {
    for (const [source, decoded] of CHARACTER_REFERENCE_CASES) {
      expect(decodeMarkdownCharacterReferences(source), source).toBe(decoded);
    }
  });

  it('decodes exactly as Markdown renders text', () => {
    for (const [source] of CHARACTER_REFERENCE_CASES) {
      const rendered = parseInline(source)
        .map(node => ('content' in node ? node.content : ''))
        .join('');
      expect(decodeMarkdownCharacterReferences(source), source).toBe(rendered);
    }
  });

  it('returns the same string when there is nothing to decode', () => {
    const text = 'plain & simple';
    expect(decodeMarkdownCharacterReferences(text)).toBe(text);
  });
});

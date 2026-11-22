// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The preview's file hash is kept for each full text in one process: two
 * texts never share an entry, a text hashes the same kept or not, and the
 * oldest text goes once the bound is reached.
 */

import {describe, expect, it} from 'vitest';
import {
  CONTENT_HASHES,
  CONTENT_HASHES_KEPT,
  contentHash,
} from './_preview-app.mjs';

describe('the preview file hash', () => {
  it('keeps one entry for each full text, and two texts never share one', () => {
    CONTENT_HASHES.clear();
    const a = 'export default function A() { return <div>a</div>; }\n';
    const b = 'export default function A() { return <div>b</div>; }\n';
    const first = contentHash(a);
    const other = contentHash(b);
    expect(other).not.toBe(first);
    expect(contentHash(a)).toBe(first);
    // A formatter's change is the same code, kept under its own text.
    const formatted =
      'export default function A() {\n  return <div>a</div>;\n}\n';
    expect(contentHash(formatted)).toBe(first);
    expect(CONTENT_HASHES.size).toBe(3);
    // A file read as bytes hashes as its text.
    expect(contentHash(Buffer.from(b))).toBe(other);
    expect(CONTENT_HASHES.size).toBe(3);
  });

  it('keeps at most its bound of texts, and the oldest goes first', () => {
    CONTENT_HASHES.clear();
    const text = (/** @type {number} */ i) => `export const v${i} = ${i};\n`;
    const first = contentHash(text(0));
    for (let i = 1; i <= CONTENT_HASHES_KEPT; i++) contentHash(text(i));
    expect(CONTENT_HASHES.size).toBe(CONTENT_HASHES_KEPT);
    expect(CONTENT_HASHES.has(text(0))).toBe(false);
    expect(CONTENT_HASHES.has(text(CONTENT_HASHES_KEPT))).toBe(true);
    // A text no longer kept hashes to the same hash again.
    expect(contentHash(text(0))).toBe(first);
  });
});

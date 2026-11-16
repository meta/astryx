// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The light stemmer reads a long noun made with -ation as its root, so
 * "document" and "documentation" are one word to search and to build.
 */

import {describe, expect, it} from 'vitest';
import {stem} from './_words.mjs';

describe('stem', () => {
  it('reads a long -ation noun as its root', () => {
    expect(stem('documentation')).toBe(stem('document'));
    expect(stem('documentations')).toBe(stem('documents'));
    expect(stem('notifications')).toBe(stem('notification'));
  });

  it('keeps a short word that only ends like one', () => {
    expect(stem('station')).toBe('station');
    expect(stem('animation')).toBe('animation');
  });
});

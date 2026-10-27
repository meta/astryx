// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {selectPage} from './selectPage';

describe('selectPage', () => {
  it('lands on a real page when the current page is past the end', () => {
    const result = selectPage({
      position: 400,
      velocity: 0,
      pageSize: 100,
      pageCount: 3,
      currentPage: 4,
    });
    expect(result.value).toBeDefined();
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(2);
  });

  it('moves at most one page per release', () => {
    const page = (position: number, velocity: number, currentPage: number) =>
      selectPage({position, velocity, pageSize: 390, pageCount: 6, currentPage})
        .index;
    expect(page(390, 0, 1)).toBe(1);
    expect(page(430, 8000, 1)).toBe(2);
    expect(page(350, -8000, 1)).toBe(0);
    // A slow drag past half a page settles on the next page.
    expect(page(600, 0, 1)).toBe(2);
    expect(page(1950, 9000, 5)).toBe(5);
  });
});

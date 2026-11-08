// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  formatBenchmarkChange,
  generateMarkdownFixture,
  nextStreamOffset,
} from './benchmark';

describe('Markdown performance fixture', () => {
  it('generates the requested deterministic section count', () => {
    const first = generateMarkdownFixture(3);
    const second = generateMarkdownFixture(3);

    expect(second).toBe(first);
    expect(first.match(/^## Section /gm)).toHaveLength(3);
    expect(first).toContain('const section3 = {id: 3, ready: true};');
  });

  it('formats missing, zero, positive, and negative baseline changes', () => {
    expect(formatBenchmarkChange(null, 10)).toBe('—');
    expect(formatBenchmarkChange(10, null)).toBe('—');
    expect(formatBenchmarkChange(0, 0)).toBe('0.0%');
    expect(formatBenchmarkChange(1, 0)).toBe('new');
    expect(formatBenchmarkChange(110, 100)).toBe('+10.0%');
    expect(formatBenchmarkChange(90, 100)).toBe('-10.0%');
  });

  it('advances streaming offsets monotonically to the exact source length', () => {
    const offsets: number[] = [];
    let offset = 0;
    while (offset < 10) {
      offset = nextStreamOffset(10, offset, 4);
      offsets.push(offset);
    }

    expect(offsets).toEqual([4, 8, 10]);
  });

  it('rejects invalid streaming dimensions', () => {
    expect(() => nextStreamOffset(-1, 0, 1)).toThrow(RangeError);
    expect(() => nextStreamOffset(10, -1, 1)).toThrow(RangeError);
    expect(() => nextStreamOffset(10, 0, 0)).toThrow(RangeError);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measuredListWindow.test.ts
 * @input The measured block-axis math of the private list-windowing module
 * @output Offset, range, gap and reveal-offset assertions
 * @position Colocated tests for the private list-windowing module
 */
import {describe, expect, it} from 'vitest';
import {
  buildItemOffsets,
  calculateMeasuredRange,
  createMeasuredSegments,
  revealOffset,
} from './measuredListWindow';

const sizes = [100, 50, 200, 80, 120, 60];

describe('measured list window math', () => {
  it('builds start offsets plus the total extent', () => {
    expect(buildItemOffsets(sizes.length, index => sizes[index])).toEqual([
      0, 100, 150, 350, 430, 550, 610,
    ]);
    expect(buildItemOffsets(0, () => 10)).toEqual([0]);
  });

  it('mounts the items that cover the scrollport plus pixel overscan on each side', () => {
    const offsets = buildItemOffsets(1000, () => 100);
    expect(
      calculateMeasuredRange({
        offsets,
        scrollOffset: 50_000,
        viewportSize: 600,
        overscanBefore: 600,
        overscanAfter: 300,
      }),
    ).toEqual({start: 494, end: 509});
    // At the end, the overscan that has no items below moves above.
    expect(
      calculateMeasuredRange({
        offsets,
        scrollOffset: 99_400,
        viewportSize: 600,
        overscanBefore: 600,
        overscanAfter: 300,
      }),
    ).toEqual({start: 985, end: 1000});
  });

  it('sizes each gap from the items it stands for, and keeps a retained last item', () => {
    const offsets = buildItemOffsets(10, () => 100);
    expect(createMeasuredSegments(offsets, 4, 6, undefined)).toEqual([
      {type: 'gap', start: 0, end: 4, height: 400},
      {type: 'rows', start: 4, end: 6},
      {type: 'gap', start: 6, end: 10, height: 400},
    ]);
    expect(createMeasuredSegments(offsets, 4, 6, 9)).toEqual([
      {type: 'gap', start: 0, end: 4, height: 400},
      {type: 'rows', start: 4, end: 6},
      {type: 'gap', start: 6, end: 9, height: 300},
      {type: 'rows', start: 9, end: 10},
    ]);
    // The last item stays mounted when it is retained.
    expect(createMeasuredSegments(offsets, 4, 6, undefined, true)).toEqual([
      {type: 'gap', start: 0, end: 4, height: 400},
      {type: 'rows', start: 4, end: 6},
      {type: 'gap', start: 6, end: 9, height: 300},
      {type: 'rows', start: 9, end: 10},
    ]);
  });

  it('places a revealed item at the start, the center or the end of the scrollport', () => {
    expect(revealOffset('start', 100, 600)).toBe(0);
    expect(revealOffset('center', 100, 600)).toBe(250);
    expect(revealOffset('end', 100, 600)).toBe(500);
    // A tall item ends at the scrollport's end with its top above it.
    expect(revealOffset('end', 900, 600)).toBe(-300);
  });
});

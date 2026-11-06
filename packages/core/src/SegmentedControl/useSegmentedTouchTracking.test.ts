// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSegmentedTouchTracking.test.ts
 * @input useSegmentedTouchTracking.ts's segment resolution
 * @output Proof of which segment a finger counts for, the rule the
 *   action-group tracker resolves the highlight and the commit with
 * @position Testing for /packages/core/src/SegmentedControl/useSegmentedTouchTracking.ts
 */

import {describe, expect, it} from 'vitest';
import {
  liftTargetAt,
  segmentTargetAt,
  type SegmentSpan,
} from './useSegmentedTouchTracking';

function spans(
  layout: ReadonlyArray<[string, number, number]>,
  disabled: ReadonlyArray<string> = [],
): SegmentSpan[] {
  return layout.map(([value, left, right]) => {
    const element = document.createElement('button');
    element.dataset.value = value;
    if (disabled.includes(value)) {
      element.setAttribute('aria-disabled', 'true');
    }
    return {element, left, right};
  });
}

const valueAt = (x: number, segments: SegmentSpan[]) =>
  segmentTargetAt(x, segments)?.dataset.value ?? null;

describe('segmentTargetAt', () => {
  // Gaps of 4 px, and a narrow segment beside a wide one.
  const layout: ReadonlyArray<[string, number, number]> = [
    ['grid', 12, 108],
    ['list', 112, 152],
    ['table', 156, 314],
  ];

  it('counts a finger over a segment for that segment, however near a narrower neighbour’s center', () => {
    const segments = spans(layout);
    // Inside Table, nearer List's center (132) than Table's own (235).
    expect(valueAt(160, segments)).toBe('table');
    expect(valueAt(60, segments)).toBe('grid');
  });

  it('splits a gap at its middle', () => {
    const segments = spans(layout);
    expect(valueAt(109, segments)).toBe('grid');
    expect(valueAt(111, segments)).toBe('list');
    expect(valueAt(153, segments)).toBe('list');
    expect(valueAt(155, segments)).toBe('table');
  });

  it('counts a finger on the padding past either end for the end segment', () => {
    const segments = spans(layout);
    expect(valueAt(-40, segments)).toBe('grid');
    expect(valueAt(400, segments)).toBe('table');
  });

  it('counts a finger over a disabled segment for nothing', () => {
    const segments = spans(layout, ['list']);
    expect(valueAt(130, segments)).toBeNull();
    expect(valueAt(111, segments)).toBeNull();
    expect(valueAt(109, segments)).toBe('grid');
  });
});

describe('liftTargetAt', () => {
  // The control's box: the segments plus 2 px of padding all round.
  const bounds = {left: 10, top: 20, right: 316, bottom: 51};
  const layout: ReadonlyArray<[string, number, number]> = [
    ['grid', 12, 108],
    ['list', 110, 208],
    ['table', 210, 314],
  ];
  const liftAt = (x: number, y: number, segments: SegmentSpan[]) =>
    liftTargetAt(x, y, bounds, segments)?.dataset.value ?? null;

  it('commits the segment a lift inside the control counts for, the padding included', () => {
    const segments = spans(layout);
    expect(liftAt(250, 35, segments)).toBe('table');
    expect(liftAt(109, 35, segments)).toBe('grid');
    expect(liftAt(11, 21, segments)).toBe('grid');
    expect(liftAt(315, 50, segments)).toBe('table');
  });

  it('commits nothing for a lift outside the control: a press that slides off cancels (spec:AST-020 FR9, DEC-5)', () => {
    const segments = spans(layout);
    // Past either end, above, below.
    expect(liftAt(5, 35, segments)).toBeNull();
    expect(liftAt(330, 35, segments)).toBeNull();
    expect(liftAt(250, 10, segments)).toBeNull();
    expect(liftAt(250, 90, segments)).toBeNull();
  });

  it('commits nothing over a disabled segment', () => {
    expect(liftAt(150, 35, spans(layout, ['list']))).toBeNull();
  });
});

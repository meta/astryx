// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {computeOverflow, type ComputeOverflowInput} from './computeOverflow';

// Convenience wrapper with sensible defaults so each test states only what it
// exercises. All widths/gaps are plain numbers — no DOM involved.
function compute(overrides: Partial<ComputeOverflowInput>) {
  return computeOverflow({
    widths: [],
    gap: 0,
    availableWidth: 0,
    indicatorWidth: 0,
    minVisibleItems: 0,
    collapseFrom: 'end',
    ...overrides,
  });
}

describe('computeOverflow — single line, no limits (parity with legacy loop)', () => {
  it('shows all items when they fit', () => {
    // 3×50, gap 10 → 170 ≤ 200
    expect(
      compute({widths: [50, 50, 50], gap: 10, availableWidth: 200}),
    ).toEqual({visibleCount: 3, rows: 1});
  });

  it('hides items that do not fit and reserves indicator space', () => {
    // 4×50, gap 10, indicator 30, container 150 → 2 fit
    expect(
      compute({
        widths: [50, 50, 50, 50],
        gap: 10,
        indicatorWidth: 30,
        availableWidth: 150,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('shows zero when nothing fits and floor is 0', () => {
    expect(
      compute({
        widths: [100, 100, 100],
        indicatorWidth: 30,
        availableWidth: 50,
      }),
    ).toEqual({visibleCount: 0, rows: 0});
  });

  it('exact fit with indicator not needed shows all', () => {
    // 3×50, gap 10 → 170 == 170
    expect(
      compute({
        widths: [50, 50, 50],
        gap: 10,
        indicatorWidth: 30,
        availableWidth: 170,
      }),
    ).toEqual({visibleCount: 3, rows: 1});
  });

  it('shows all when they fit, though the last item is narrower than the indicator', () => {
    // 60 + 40 + 40, gap 10 → 160 == 160; a 50 px indicator never shows.
    for (const collapseFrom of ['end', 'start'] as const) {
      expect(
        compute({
          widths: collapseFrom === 'end' ? [60, 40, 40] : [40, 40, 60],
          gap: 10,
          indicatorWidth: 50,
          availableWidth: 160,
          collapseFrom,
        }),
      ).toEqual({visibleCount: 3, rows: 1});
    }
  });

  it('off-by-one: one pixel short drops the last item', () => {
    expect(
      compute({
        widths: [50, 50, 50],
        gap: 10,
        indicatorWidth: 30,
        availableWidth: 169,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('works without an indicator', () => {
    // 3×50, gap 10, container 130 → 2 fit
    expect(
      compute({widths: [50, 50, 50], gap: 10, availableWidth: 130}),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('varied widths', () => {
    expect(
      compute({
        widths: [30, 80, 40, 60],
        gap: 10,
        indicatorWidth: 25,
        availableWidth: 200,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });
});

describe('computeOverflow — floor (minVisibleItems)', () => {
  it('respects the floor even when items do not fit', () => {
    expect(
      compute({
        widths: [100, 100, 100],
        indicatorWidth: 30,
        availableWidth: 50,
        minVisibleItems: 2,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('floor larger than itemCount is clamped to itemCount', () => {
    expect(
      compute({
        widths: [100, 100],
        availableWidth: 10,
        minVisibleItems: 5,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });
});

describe('computeOverflow — cap (maxVisibleItems)', () => {
  it('caps below fit even when everything fits', () => {
    // all 5 fit in a wide container, cap at 2
    expect(
      compute({
        widths: [40, 40, 40, 40, 40],
        gap: 8,
        availableWidth: 10000,
        maxVisibleItems: 2,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('cap of 0 shows nothing', () => {
    expect(
      compute({
        widths: [40, 40, 40],
        availableWidth: 10000,
        maxVisibleItems: 0,
      }),
    ).toEqual({visibleCount: 0, rows: 0});
  });

  it('cap greater than itemCount is a no-op', () => {
    expect(
      compute({
        widths: [40, 40, 40],
        gap: 8,
        availableWidth: 10000,
        maxVisibleItems: 99,
      }),
    ).toEqual({visibleCount: 3, rows: 1});
  });

  it('cap does not raise a fit-limited count', () => {
    // container only fits 2, cap is 4 → still 2
    expect(
      compute({
        widths: [50, 50, 50, 50],
        gap: 10,
        indicatorWidth: 30,
        availableWidth: 150,
        maxVisibleItems: 4,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });
});

describe('computeOverflow — cap + floor composition', () => {
  it('both honored when min <= max', () => {
    // fit would be 2; floor 1, cap 3 → 2
    expect(
      compute({
        widths: [50, 50, 50, 50],
        gap: 10,
        indicatorWidth: 30,
        availableWidth: 150,
        minVisibleItems: 1,
        maxVisibleItems: 3,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('D1: when max < min, min wins', () => {
    // wide container fits all 5; floor 3, cap 1 → floor wins → 3
    expect(
      compute({
        widths: [40, 40, 40, 40, 40],
        gap: 8,
        availableWidth: 10000,
        minVisibleItems: 3,
        maxVisibleItems: 1,
      }),
    ).toEqual({visibleCount: 3, rows: 1});
  });
});

describe('computeOverflow — collapseFrom start vs end + cap', () => {
  it('single-line collapseFrom start keeps the tail', () => {
    // Items: 30, 80, 40. gap 10, indicator 25, container 100.
    // reversed: [40, 80, 30] → only 40 fits → visibleCount 1
    expect(
      compute({
        widths: [30, 80, 40],
        gap: 10,
        indicatorWidth: 25,
        availableWidth: 100,
        collapseFrom: 'start',
      }),
    ).toEqual({visibleCount: 1, rows: 1});
  });

  it('collapseFrom start + cap trims from the correct end', () => {
    expect(
      compute({
        widths: [40, 40, 40, 40],
        gap: 8,
        availableWidth: 10000,
        collapseFrom: 'start',
        maxVisibleItems: 2,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });
});

describe('computeOverflow — multi-row (maxRows)', () => {
  it('maxRows 1 is equivalent to single line', () => {
    const single = compute({
      widths: [50, 50, 50, 50],
      gap: 10,
      indicatorWidth: 30,
      availableWidth: 150,
    });
    const withMaxRows1 = compute({
      widths: [50, 50, 50, 50],
      gap: 10,
      indicatorWidth: 30,
      availableWidth: 150,
      maxRows: 1,
    });
    expect(withMaxRows1).toEqual(single);
    expect(withMaxRows1).toEqual({visibleCount: 2, rows: 1});
  });

  it('packs items onto exactly maxRows rows when all fit', () => {
    // 6×50, gap 10 → each row of width 170 holds 3 (50+10+50+10+50=170).
    // availableWidth 170, maxRows 2 → all 6 fit on 2 rows.
    expect(
      compute({
        widths: [50, 50, 50, 50, 50, 50],
        gap: 10,
        availableWidth: 170,
        maxRows: 2,
      }),
    ).toEqual({visibleCount: 6, rows: 2});
  });

  it('collapses overflow past maxRows into the indicator (reserved on last row)', () => {
    // 8×50, gap 10, width 170 → 3 per row. maxRows 2.
    // Row 1: 3 items (170). Row 2 (last): reserve indicator 40 + gap 10 = 50.
    //   available for items on row 2 = 170; place 50 (ok, rowWidth 50),
    //   next 50 → 50+10+50=110 + reserve 50 = 160 ≤ 170 ok (2 items),
    //   next 50 → 110+10+50=170 + 50 = 220 > 170 stop. Row 2 holds 2.
    // → 3 + 2 = 5 visible, 2 rows.
    expect(
      compute({
        widths: [50, 50, 50, 50, 50, 50, 50, 50],
        gap: 10,
        indicatorWidth: 40,
        availableWidth: 170,
        maxRows: 2,
      }),
    ).toEqual({visibleCount: 5, rows: 2});
  });

  it('all items on a single row still reports rows: 1 under maxRows 2', () => {
    expect(
      compute({
        widths: [30, 30, 30],
        gap: 5,
        availableWidth: 500,
        maxRows: 2,
      }),
    ).toEqual({visibleCount: 3, rows: 1});
  });

  it('cap wins when it is stricter than the rows allow', () => {
    // 6 items fit on 2 rows, but cap at 4 → 4 visible.
    expect(
      compute({
        widths: [50, 50, 50, 50, 50, 50],
        gap: 10,
        indicatorWidth: 40,
        availableWidth: 170,
        maxRows: 2,
        maxVisibleItems: 4,
      }),
    ).toEqual({visibleCount: 4, rows: 2});
  });

  it('rows win when they are stricter than the cap', () => {
    // maxRows 2 admits 5 (see above); cap 8 is looser → rows win → 5.
    expect(
      compute({
        widths: [50, 50, 50, 50, 50, 50, 50, 50],
        gap: 10,
        indicatorWidth: 40,
        availableWidth: 170,
        maxRows: 2,
        maxVisibleItems: 8,
      }),
    ).toEqual({visibleCount: 5, rows: 2});
  });

  it('multi-row collapseFrom start keeps the tail items', () => {
    // 8 items, reversed packing; same geometry as the end case → 5 visible.
    const res = compute({
      widths: [50, 50, 50, 50, 50, 50, 50, 50],
      gap: 10,
      indicatorWidth: 40,
      availableWidth: 170,
      maxRows: 2,
      collapseFrom: 'start',
    });
    expect(res).toEqual({visibleCount: 5, rows: 2});
  });

  it('maxRows taller than content does not add phantom rows', () => {
    // 3 items fit on one row; maxRows 5 → rows 1, all visible.
    expect(
      compute({
        widths: [40, 40, 40],
        gap: 10,
        availableWidth: 500,
        maxRows: 5,
      }),
    ).toEqual({visibleCount: 3, rows: 1});
  });

  it('floor is honored in multi-row even when nothing fits', () => {
    // Very narrow container, floor 2.
    expect(
      compute({
        widths: [500, 500, 500],
        gap: 10,
        indicatorWidth: 40,
        availableWidth: 100,
        maxRows: 2,
        minVisibleItems: 2,
      }),
    ).toEqual({visibleCount: 2, rows: 2});
  });
});

describe('computeOverflow — resize behavior (shrink/grow re-clamps, never exceeds cap)', () => {
  const base: Partial<ComputeOverflowInput> = {
    widths: [50, 50, 50, 50, 50],
    gap: 10,
    indicatorWidth: 30,
    maxVisibleItems: 3,
  };

  it('grows back only up to the cap', () => {
    // Huge container would fit all 5, cap holds at 3.
    expect(compute({...base, availableWidth: 10000})).toEqual({
      visibleCount: 3,
      rows: 1,
    });
  });

  it('shrinks below the cap when space is tight', () => {
    // Narrow container fits fewer than the cap.
    expect(compute({...base, availableWidth: 150})).toEqual({
      visibleCount: 2,
      rows: 1,
    });
  });

  it('never exceeds the cap across a shrink→grow cycle', () => {
    const shrunk = compute({...base, availableWidth: 120});
    const grown = compute({...base, availableWidth: 10000});
    expect(grown.visibleCount).toBeLessThanOrEqual(3);
    expect(shrunk.visibleCount).toBeLessThanOrEqual(grown.visibleCount);
  });
});

describe('computeOverflow — degenerate inputs', () => {
  it('empty list', () => {
    expect(compute({widths: []})).toEqual({visibleCount: 0, rows: 0});
  });

  it('single item that fits', () => {
    expect(compute({widths: [50], gap: 10, availableWidth: 100})).toEqual({
      visibleCount: 1,
      rows: 1,
    });
  });

  it('single item that does not fit, no floor', () => {
    expect(
      compute({widths: [200], indicatorWidth: 30, availableWidth: 100}),
    ).toEqual({visibleCount: 0, rows: 0});
  });

  it('maxRows 0 falls back to single-line semantics', () => {
    // maxRows 0 is degenerate; treated as single line (not multi-row).
    expect(
      compute({
        widths: [50, 50, 50],
        gap: 10,
        availableWidth: 130,
        maxRows: 0,
      }),
    ).toEqual({visibleCount: 2, rows: 1});
  });

  it('cap 0 with floor 0 and multi-row shows nothing', () => {
    expect(
      compute({
        widths: [50, 50],
        gap: 10,
        availableWidth: 500,
        maxRows: 2,
        maxVisibleItems: 0,
      }),
    ).toEqual({visibleCount: 0, rows: 0});
  });
});

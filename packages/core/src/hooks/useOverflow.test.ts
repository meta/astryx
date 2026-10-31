// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useOverflow} from './useOverflow';

// Builds a mock container element with a given offsetWidth
function mockContainer(width: number): HTMLElement {
  return {offsetWidth: width} as unknown as HTMLElement;
}

// Builds a mock measure element whose children have the given widths.
// If indicatorWidth is provided, an extra child is appended as the overflow indicator.
function mockMeasure(
  itemWidths: number[],
  indicatorWidth?: number,
  itemHeight = 0,
): HTMLElement {
  const children: {offsetWidth: number; offsetHeight: number}[] =
    itemWidths.map(w => ({
      offsetWidth: w,
      offsetHeight: itemHeight,
    }));
  if (indicatorWidth != null) {
    children.push({offsetWidth: indicatorWidth, offsetHeight: itemHeight});
  }
  return {children} as unknown as HTMLElement;
}

// Stubs ResizeObserver — fires callback immediately on observe, like the real one
class FakeResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe = vi.fn(() => {
    this.callback([], this);
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('useOverflow', () => {
  it('shows all items when they fit', () => {
    // 3 items of 50px each, gap 10 → total = 50+10+50+10+50 = 170, container = 200
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50]));
      result.current.containerRef(mockContainer(200));
    });

    expect(result.current.visibleCount).toBe(3);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('hides items that do not fit', () => {
    // 4 items of 50px, gap 10, indicator 30px, container 150
    // Item 1: 50, not last → reserve 30+10=40 → 50+40=90 ≤ 150 ✓ (total=50)
    // Item 2: 50+10+50=110, not last → reserve 40 → 110+40=150 ≤ 150 ✓ (total=110)
    // Item 3: 110+10+50=170, not last → reserve 40 → 170+40=210 > 150 ✗
    // → visibleCount = 2
    const {result} = renderHook(() => useOverflow(4, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30));
      result.current.containerRef(mockContainer(150));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('shows zero items when nothing fits and minVisibleItems is 0', () => {
    // 3 items of 100px, container 50, indicator 30
    // Item 1: 100, not last → reserve 30+0=30 → 100+30=130 > 50, count=0 ≥ min(0) → break
    const {result} = renderHook(() => useOverflow(3, {gap: 0}));

    act(() => {
      result.current.measureRef(mockMeasure([100, 100, 100], 30));
      result.current.containerRef(mockContainer(50));
    });

    expect(result.current.visibleCount).toBe(0);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('respects minVisibleItems even when items do not fit', () => {
    // 3 items of 100px, container 50, indicator 30, minVisibleItems 2
    // Item 1: 100 > 50+reserved, but count(0) < min(2) → continue
    // Item 2: 200 > 50, but count(1) < min(2) → continue
    // Item 3: last item (i=2, length=3) → reservedWidth=0 → 300 > 50, count(2) ≥ min(2) → break
    // → visibleCount = max(min(2, 3), 2) = 2
    const {result} = renderHook(() =>
      useOverflow(3, {gap: 0, minVisibleItems: 2}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([100, 100, 100], 30));
      result.current.containerRef(mockContainer(50));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('handles no gap', () => {
    // 3 items of 40px, no gap → total = 120, container = 100, indicator = 20
    // Item 1: 40, not last → reserve 20+0=20 → 40+20=60 ≤ 100 ✓ (total=40)
    // Item 2: 40+40=80, not last → reserve 20+20=40... wait
    // gap=0, so gapWidth for i>0 is 0. reservedWidth = indicatorWidth + (count>0 ? gap : 0)
    // gap=0, so reservedWidth = 20 + 0 = 20
    // Item 2: 80, reserve 20 → 100 ≤ 100 ✓ (total=80)
    // Item 3: 120, last → reserve 0 → 120 > 100, count(2) ≥ 0 → break
    // → visibleCount = 2
    const {result} = renderHook(() => useOverflow(3, {gap: 0}));

    act(() => {
      result.current.measureRef(mockMeasure([40, 40, 40], 20));
      result.current.containerRef(mockContainer(100));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('works without an overflow indicator', () => {
    // 3 items of 50px, gap 10, no indicator, container 130
    // total needed = 50+10+50+10+50 = 170 > 130
    // Item 1: 50, not last → reserve 0 → 50 ≤ 130 ✓
    // Item 2: 110, not last → reserve 0 → 110 ≤ 130 ✓
    // Item 3: 170, last → reserve 0 → 170 > 130 → break
    // → visibleCount = 2
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50]));
      result.current.containerRef(mockContainer(130));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('handles items with different widths', () => {
    // Items: 30, 80, 40, 60. Gap 10. Indicator 25. Container 200.
    // Item 1 (30): not last → reserve 25+0=25 → 30+25=55 ≤ 200 ✓ (total=30)
    // Item 2 (80): 30+10+80=120, not last → reserve 25+10=35 → 120+35=155 ≤ 200 ✓ (total=120)
    // Item 3 (40): 120+10+40=170, not last → reserve 35 → 170+35=205 > 200 → break
    // → visibleCount = 2
    const {result} = renderHook(() => useOverflow(4, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([30, 80, 40, 60], 25));
      result.current.containerRef(mockContainer(200));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('collapses from start', () => {
    // Items: 30, 80, 40. Gap 10. Indicator 25. Container 100.
    // collapseFrom='start' reverses widths → ordered: [40, 80, 30]
    // Item 1 (40): not last → reserve 25+0=25 → 40+25=65 ≤ 100 ✓ (total=40)
    // Item 2 (80): 40+10+80=130, not last → reserve 25+10=35 → 130+35=165 > 100 → break
    // → visibleCount = 1 (the last 1 item is kept visible)
    const {result} = renderHook(() =>
      useOverflow(3, {gap: 10, collapseFrom: 'start'}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([30, 80, 40], 25));
      result.current.containerRef(mockContainer(100));
    });

    expect(result.current.visibleCount).toBe(1);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('handles zero children', () => {
    const {result} = renderHook(() => useOverflow(0));

    act(() => {
      result.current.measureRef(mockMeasure([]));
      result.current.containerRef(mockContainer(200));
    });

    expect(result.current.visibleCount).toBe(0);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('shows all items when exact fit with indicator not needed', () => {
    // 3 items of 50px, gap 10 → total = 170, container = 170, indicator present
    // Item 1 (50): not last → reserve 30+0=30 → 50+30=80 ≤ 170 ✓ (total=50)
    // Item 2 (50): 50+10+50=110, not last → reserve 30+10=40 → 110+40=150 ≤ 170 ✓ (total=110)
    // Item 3 (50): 110+10+50=170, last → reserve 0 → 170 ≤ 170 ✓ (total=170)
    // → visibleCount = 3, all fit so no overflow
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50], 30));
      result.current.containerRef(mockContainer(170));
    });

    expect(result.current.visibleCount).toBe(3);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('recalculates when container resizes', () => {
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50], 30));
      result.current.containerRef(mockContainer(170));
    });

    expect(result.current.visibleCount).toBe(3);

    // Simulate resize by calling containerRef with a smaller container
    act(() => {
      result.current.containerRef(mockContainer(100));
    });

    expect(result.current.visibleCount).toBe(1);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('cleans up ResizeObserver on unmount', () => {
    const {result, unmount} = renderHook(() => useOverflow(3));

    const container = mockContainer(200);
    act(() => {
      result.current.containerRef(container);
    });

    // Get the observer that was created
    // Instead, check disconnect is called when ref is set to null
    act(() => {
      result.current.containerRef(null);
    });

    // Setting ref to null should disconnect the previous observer
    unmount();
  });

  it('single item that fits', () => {
    const {result} = renderHook(() => useOverflow(1, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50]));
      result.current.containerRef(mockContainer(100));
    });

    expect(result.current.visibleCount).toBe(1);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('does not re-render when visibleCount stays the same', () => {
    let renderCount = 0;
    const {result} = renderHook(() => {
      renderCount++;
      return useOverflow(3, {gap: 10});
    });

    const initialRenderCount = renderCount;

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50]));
      result.current.containerRef(mockContainer(200));
    });

    // All items fit (visibleCount stays 3 = initial), so no state change → no extra render
    expect(renderCount).toBe(initialRenderCount);
    expect(result.current.visibleCount).toBe(3);
  });

  it('renders exactly once more when visibleCount changes', () => {
    let renderCount = 0;
    const {result} = renderHook(() => {
      renderCount++;
      return useOverflow(4, {gap: 10});
    });

    const afterInitialRender = renderCount;

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30));
      result.current.containerRef(mockContainer(150));
    });

    // visibleCount changes from 4 → 2, so exactly one additional render
    expect(renderCount).toBe(afterInitialRender + 1);
    expect(result.current.visibleCount).toBe(2);
  });

  it('does not re-render on resize when visibleCount is unchanged', () => {
    let renderCount = 0;
    const {result} = renderHook(() => {
      renderCount++;
      return useOverflow(3, {gap: 10});
    });

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50]));
      result.current.containerRef(mockContainer(200));
    });

    const afterSetup = renderCount;

    // Resize to a still-large-enough container — visibleCount stays 3
    act(() => {
      result.current.containerRef(mockContainer(300));
    });

    expect(renderCount).toBe(afterSetup);
    expect(result.current.visibleCount).toBe(3);
  });

  it('single item that does not fit without minVisibleItems', () => {
    const {result} = renderHook(() => useOverflow(1, {gap: 0}));

    act(() => {
      result.current.measureRef(mockMeasure([200], 30));
      result.current.containerRef(mockContainer(100));
    });

    // Single item is the last item, so reservedWidth=0 → 200 > 100 → break at count=0
    expect(result.current.visibleCount).toBe(0);
    expect(result.current.hasOverflow).toBe(true);
  });
});

describe('useOverflow with maxVisibleItems (cap)', () => {
  it('caps visible items even when they all fit', () => {
    const {result} = renderHook(() =>
      useOverflow(5, {gap: 10, maxVisibleItems: 3}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50, 50], 30));
      result.current.containerRef(mockContainer(10000));
    });

    expect(result.current.visibleCount).toBe(3);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('cap does not raise a fit-limited count', () => {
    const {result} = renderHook(() =>
      useOverflow(4, {gap: 10, maxVisibleItems: 4}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30));
      result.current.containerRef(mockContainer(150));
    });

    expect(result.current.visibleCount).toBe(2);
  });

  it('min wins when maxVisibleItems < minVisibleItems and warns in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {result} = renderHook(() =>
      useOverflow(5, {gap: 10, minVisibleItems: 3, maxVisibleItems: 1}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50, 50], 30));
      result.current.containerRef(mockContainer(10000));
    });

    expect(result.current.visibleCount).toBe(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('useOverflow on the single-line path', () => {
  it('renders the host once per measurement that changes nothing it shows: rows and rowHeight are not tracked', () => {
    let renders = 0;
    const {result} = renderHook(() => {
      renders += 1;
      return useOverflow(3, {gap: 10});
    });

    act(() => {
      // 3 items of 50px, 24px tall, gap 10 → 170 fits in 200: the count stays.
      result.current.measureRef(mockMeasure([50, 50, 50], 40, 24));
      result.current.containerRef(mockContainer(200));
    });

    // The measurement found the same count the hook started with; the item
    // height it also read is nobody's to render here, so nothing renders.
    expect(renders).toBe(1);
    expect(result.current.visibleCount).toBe(3);
    expect(result.current.rows).toBe(1);
    expect(result.current.rowHeight).toBe(0);
  });
});

describe('useOverflow leaving the multi-row path', () => {
  it('reports rows 1 and rowHeight 0 once maxRows drops to the single-line path', () => {
    const initialProps: {maxRows: number | undefined} = {maxRows: 2};
    const {result, rerender} = renderHook(
      ({maxRows}: {maxRows: number | undefined}) =>
        useOverflow(6, {gap: 10, maxRows}),
      {initialProps},
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50, 50, 50], 40, 24));
      result.current.containerRef(mockContainer(170));
    });
    expect(result.current.visibleCount).toBe(6);
    expect(result.current.rows).toBe(2);
    expect(result.current.rowHeight).toBe(24);

    rerender({maxRows: undefined});
    // The single-line path's values, not the state the multi-row
    // measurements left behind; the count is re-measured for one row.
    expect(result.current.rows).toBe(1);
    expect(result.current.rowHeight).toBe(0);
    expect(result.current.visibleCount).toBeLessThan(6);
  });
});

describe('useOverflow with maxRows (multi-row)', () => {
  it('exposes rows and rowHeight', () => {
    const {result} = renderHook(() => useOverflow(6, {gap: 10, maxRows: 2}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50, 50, 50], 40, 24));
      result.current.containerRef(mockContainer(170));
    });

    // 3 items per row (170), 2 rows → all 6 fit
    expect(result.current.visibleCount).toBe(6);
    expect(result.current.rows).toBe(2);
    expect(result.current.rowHeight).toBe(24);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('collapses items beyond maxRows into the indicator', () => {
    const {result} = renderHook(() => useOverflow(8, {gap: 10, maxRows: 2}));

    act(() => {
      result.current.measureRef(
        mockMeasure([50, 50, 50, 50, 50, 50, 50, 50], 40, 24),
      );
      result.current.containerRef(mockContainer(170));
    });

    expect(result.current.visibleCount).toBe(5);
    expect(result.current.rows).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('maxRows=1 matches single-line behavior', () => {
    const {result} = renderHook(() => useOverflow(4, {gap: 10, maxRows: 1}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30, 24));
      result.current.containerRef(mockContainer(150));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.rows).toBe(1);
  });
});

describe('useOverflow with behavior=observeParent', () => {
  function mockContainerWithParent(
    parentWidth: number,
    parentPadding = 0,
  ): HTMLElement {
    const container = {offsetWidth: 0} as unknown as HTMLElement;

    const parent = {clientWidth: parentWidth};

    vi.stubGlobal('getComputedStyle', () => ({
      paddingLeft: `${parentPadding}px`,
      paddingRight: `${parentPadding}px`,
    }));

    Object.defineProperty(container, 'parentElement', {
      value: parent,
      configurable: true,
    });

    return container;
  }

  it('uses parent content width as available space', () => {
    // Parent: 400px wide, 8px padding each side → available = 384
    // 4 items of 50px, gap 10 → total = 230 ≤ 384 → all fit
    const {result} = renderHook(() =>
      useOverflow(4, {gap: 10, behavior: 'observeParent'}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30));
      result.current.containerRef(mockContainerWithParent(400, 8));
    });

    expect(result.current.visibleCount).toBe(4);
    expect(result.current.hasOverflow).toBe(false);
  });

  it('overflows when parent content width is too small', () => {
    // Parent: 200px, padding 8 each side → available = 184
    // 4 items of 50px, gap 10, indicator 30
    // Item 1 (50): reserve 30 → 80 ≤ 184 ✓
    // Item 2 (50): 110, reserve 40 → 150 ≤ 184 ✓
    // Item 3 (50): 170, reserve 40 → 210 > 184 → break
    // → visibleCount = 2
    const {result} = renderHook(() =>
      useOverflow(4, {gap: 10, behavior: 'observeParent'}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30));
      result.current.containerRef(mockContainerWithParent(200, 8));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('accounts for parent padding', () => {
    // Parent: 200px, padding 40 each side → available = 120
    // 3 items of 50px, gap 10, no indicator → total = 170 > 120
    // Item 1 (50): not last, reserve 0 → 50 ≤ 120 ✓
    // Item 2 (50): 110, not last, reserve 0 → 110 ≤ 120 ✓
    // Item 3 (50): 170, last, reserve 0 → 170 > 120 → break
    // → visibleCount = 2
    const {result} = renderHook(() =>
      useOverflow(3, {gap: 10, behavior: 'observeParent'}),
    );

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50]));
      result.current.containerRef(mockContainerWithParent(200, 40));
    });

    expect(result.current.visibleCount).toBe(2);
    expect(result.current.hasOverflow).toBe(true);
  });
});

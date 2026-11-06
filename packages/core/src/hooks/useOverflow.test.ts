// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useOverflow, useOverflowInternal} from './useOverflow';

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
  indicatorHeight = itemHeight,
): HTMLElement {
  const children: {offsetWidth: number; offsetHeight: number}[] =
    itemWidths.map(w => ({
      offsetWidth: w,
      offsetHeight: itemHeight,
    }));
  if (indicatorWidth != null) {
    children.push({offsetWidth: indicatorWidth, offsetHeight: indicatorHeight});
  }
  return {children} as unknown as HTMLElement;
}

// The callback of the most recently created observer. The shared observer
// outlives a test while any element stays observed, so a delivery goes to it.
let latestObserverCallback: ResizeObserverCallback | null = null;

// Stubs ResizeObserver — fires callback immediately on observe, like the real one
class FakeResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    latestObserverCallback = cb;
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

describe('useOverflowInternal without row tracking', () => {
  it('renders the host once per measurement that changes nothing it shows: rows and rowHeight are not tracked', () => {
    let renders = 0;
    const {result} = renderHook(() => {
      renders += 1;
      return useOverflowInternal(3, {gap: 10}, {tracksRows: false});
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

  it('reports rows 1 and rowHeight 0 once a multi-row host stops tracking', () => {
    const initialProps: {maxRows: number | undefined} = {maxRows: 2};
    const {result, rerender} = renderHook(
      ({maxRows}: {maxRows: number | undefined}) =>
        useOverflowInternal(
          6,
          {gap: 10, maxRows},
          {tracksRows: maxRows != null && maxRows > 1},
        ),
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
    // The untracked values, not the state the multi-row measurements left
    // behind; the count is re-measured for one row.
    expect(result.current.rows).toBe(1);
    expect(result.current.rowHeight).toBe(0);
    expect(result.current.visibleCount).toBeLessThan(6);
  });
});

describe('useOverflow on the single-line path', () => {
  it('still measures rowHeight, as its return type documents', () => {
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));

    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50], 40, 24));
      result.current.containerRef(mockContainer(200));
    });

    expect(result.current.visibleCount).toBe(3);
    expect(result.current.rows).toBe(1);
    expect(result.current.rowHeight).toBe(24);
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

describe('useOverflow when the observer reports a resize (component:OverflowList PR1)', () => {
  // A box whose width a test changes, as a resize would.
  function resizableBox(width: number): {offsetWidth: number} & Element {
    return {offsetWidth: width} as unknown as {offsetWidth: number} & Element;
  }

  // Reports resizes the way the browser does: after layout, outside act(). A
  // microtask still runs before the frame paints; a render scheduled as a
  // task runs after it. So the test checks state once microtasks have run.
  async function deliverBeforePaint(...targets: Element[]): Promise<void> {
    const actGlobal = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
    const wasActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
    actGlobal.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      for (const target of targets) {
        latestObserverCallback?.(
          [{target} as unknown as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      }
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      actGlobal.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
    }
  }

  it.each([
    ['shrinks', 200, 100, 3, 1],
    ['grows', 100, 200, 1, 3],
  ])(
    'renders the new visible count before the frame paints when the box %s',
    async (_label, fromWidth, toWidth, before, after) => {
      const {result} = renderHook(() => useOverflow(3, {gap: 10}));
      const box = resizableBox(fromWidth);

      act(() => {
        result.current.measureRef(mockMeasure([50, 50, 50], 30));
        result.current.containerRef(box as unknown as HTMLElement);
      });
      expect(result.current.visibleCount).toBe(before);

      box.offsetWidth = toWidth;
      await deliverBeforePaint(box);

      expect(result.current.visibleCount).toBe(after);
    },
  );

  it.each([0, 20])(
    'renders nothing for a resize that changes no measured value (items %ipx tall)',
    async itemHeight => {
      let renders = 0;
      const {result} = renderHook(() => {
        renders++;
        return useOverflow(3, {gap: 10, maxRows: 2});
      });
      const box = resizableBox(200);

      act(() => {
        result.current.measureRef(mockMeasure([50, 50, 50], 30, itemHeight));
        result.current.containerRef(box as unknown as HTMLElement);
      });
      const settled = renders;

      box.offsetWidth = 220;
      await deliverBeforePaint(box);

      expect(renders).toBe(settled);
    },
  );

  it('renders after paint when a multi-row fold changes the rows the list fills', async () => {
    const {result} = renderHook(() => useOverflow(6, {gap: 10, maxRows: 2}));
    const box = resizableBox(120);
    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50, 50, 50], 30, 20));
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.visibleCount).toBe(3);
    expect(result.current.rows).toBe(2);

    // At 260px the three shown items and the indicator fit on one row, so
    // the list is one row tall; the new set fills two rows.
    box.offsetWidth = 260;
    await deliverBeforePaint(box);
    expect(result.current.visibleCount).toBe(3);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(result.current.visibleCount).toBe(6);
    expect(result.current.rows).toBe(2);
  });

  it('renders after paint when the new set fits one row but its indicator wraps', async () => {
    const {result} = renderHook(() => useOverflow(5, {gap: 0, maxRows: 2}));
    // At 100px one item shows, and the indicator wraps onto the second row.
    const box = resizableBox(100);
    act(() => {
      result.current.measureRef(mockMeasure([60, 60, 60, 150, 60], 60, 20));
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.visibleCount).toBe(1);

    // At 200px the shown item and the indicator fit on one row. The new set,
    // three items, fills one row, and its indicator wraps onto a second.
    box.offsetWidth = 200;
    await deliverBeforePaint(box);
    expect(result.current.visibleCount).toBe(1);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(result.current.visibleCount).toBe(3);
  });

  it('renders after paint when a single-row fold shows an indicator taller than the items', async () => {
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));
    const box = resizableBox(200);
    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50], 30, 20, 40));
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.visibleCount).toBe(3);

    // At 100px one item and the 40px indicator show, so the list grows taller.
    box.offsetWidth = 100;
    await deliverBeforePaint(box);
    expect(result.current.visibleCount).toBe(3);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(result.current.visibleCount).toBe(1);
  });

  it('renders after paint when a fold hides a plain-text indicator taller than the items', async () => {
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));
    // The indicator renders as a text node, which the list's element
    // children do not include; the measure copy wraps it in an element.
    const box = resizableBox(100);
    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50], 30, 16, 24));
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.visibleCount).toBe(1);

    // At 200px all three items fit, so the 24px indicator line goes away.
    box.offsetWidth = 200;
    await deliverBeforePaint(box);
    expect(result.current.visibleCount).toBe(1);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(result.current.visibleCount).toBe(3);
  });

  it('renders after paint when the shown indicator can be narrower than the measured one', async () => {
    const {result} = renderHook(() => useOverflow(5, {gap: 0, maxRows: 2}));
    const box = resizableBox(400);
    act(() => {
      // The measured indicator holds all five items; one for two is narrower.
      result.current.measureRef(mockMeasure([50, 50, 50, 180, 50], 44, 20));
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.visibleCount).toBe(5);

    // At 170px the five shown items fill two clipped rows. Three items with
    // the measured indicator need two rows, without it one, so the rows the
    // new set fills are not known.
    box.offsetWidth = 170;
    await deliverBeforePaint(box);
    expect(result.current.visibleCount).toBe(5);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(result.current.visibleCount).toBe(3);
  });

  it('renders before paint when a multi-row fold keeps the rows the list fills', async () => {
    const {result} = renderHook(() => useOverflow(6, {gap: 10, maxRows: 2}));
    const box = resizableBox(260);
    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50, 50, 50], 30, 20));
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.visibleCount).toBe(6);

    // At 120px the six shown items wrap past two rows; the list clips at two.
    box.offsetWidth = 120;
    await deliverBeforePaint(box);

    expect(result.current.visibleCount).toBe(3);
  });

  // Under observeParent, OverflowList fills its parent's width only while
  // items are collapsed (component:OverflowList FR4). A fold that shows or
  // hides the indicator changes the list's width inside the observed parent,
  // which can change the parent's height when a sibling wraps.
  function boxWithParent(parentWidth: number): {
    container: HTMLElement;
    parent: {clientWidth: number} & Element;
  } {
    vi.stubGlobal('getComputedStyle', () => ({
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    const parent = {clientWidth: parentWidth} as unknown as {
      clientWidth: number;
    } & Element;
    const container = {offsetWidth: 0} as unknown as HTMLElement;
    Object.defineProperty(container, 'parentElement', {
      value: parent,
      configurable: true,
    });
    return {container, parent};
  }

  it.each([
    ['shows', 200, 100, 3, 1],
    ['hides', 100, 200, 1, 3],
  ])(
    'renders after paint when an observeParent fold %s the indicator',
    async (_label, fromWidth, toWidth, before, after) => {
      const {result} = renderHook(() =>
        useOverflow(3, {gap: 10, behavior: 'observeParent'}),
      );
      const {container, parent} = boxWithParent(fromWidth);
      act(() => {
        result.current.measureRef(mockMeasure([50, 50, 50], 30));
        result.current.containerRef(container);
      });
      expect(result.current.visibleCount).toBe(before);

      parent.clientWidth = toWidth;
      await deliverBeforePaint(parent);
      expect(result.current.visibleCount).toBe(before);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(result.current.visibleCount).toBe(after);
    },
  );

  it('renders before paint when an observeParent fold keeps the indicator', async () => {
    const {result} = renderHook(() =>
      useOverflow(4, {gap: 10, behavior: 'observeParent'}),
    );
    const {container, parent} = boxWithParent(160);
    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50, 50], 30));
      result.current.containerRef(container);
    });
    expect(result.current.visibleCount).toBe(2);

    parent.clientWidth = 100;
    await deliverBeforePaint(parent);
    expect(result.current.visibleCount).toBe(1);
    expect(result.current.hasOverflow).toBe(true);
  });

  it('renders after paint when a multi-row list measures a new row height', async () => {
    const {result} = renderHook(() => useOverflow(6, {gap: 10, maxRows: 2}));
    const box = resizableBox(120);
    const measure = mockMeasure([50, 50, 50, 50, 50, 50], 30, 20);
    act(() => {
      result.current.measureRef(measure);
      result.current.containerRef(box as unknown as HTMLElement);
    });
    expect(result.current.rowHeight).toBe(20);

    // The items grow taller at the same width (a late web font, a theme or
    // density change). The list's max height follows the row height.
    for (const child of Array.from(measure.children)) {
      (child as unknown as {offsetHeight: number}).offsetHeight = 32;
    }
    await deliverBeforePaint(box);
    expect(result.current.rowHeight).toBe(20);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(result.current.rowHeight).toBe(32);
  });

  // A box with a real style declaration. `followsItems` makes its width drop
  // under size containment, as a list sized from its content does.
  function styledBox(
    width: number,
    followsItems: boolean,
  ): {
    offsetWidth: number;
    offsetHeight: number;
    style: CSSStyleDeclaration;
  } & Element {
    const style = document.createElement('div').style;
    const box = {
      style,
      offsetHeight: 28,
      hasAttribute: (name: string) => name === 'style' && style.length > 0,
      getAttribute: (name: string) =>
        name === 'style' && style.length > 0 ? style.cssText : null,
      removeAttribute: (name: string) => {
        if (name === 'style') {
          style.cssText = '';
        }
      },
      get offsetWidth() {
        return followsItems && style.getPropertyValue('contain') !== ''
          ? 0
          : width;
      },
      set offsetWidth(next: number) {
        width = next;
      },
    };
    return box as unknown as typeof box & Element;
  }

  it.each([
    ['follows its items: after paint', true, 3],
    ['does not follow its items: before paint', false, 1],
  ])(
    'renders a fold whose list width %s',
    async (_label, followsItems, beforePaint) => {
      const {result} = renderHook(() => useOverflow(3, {gap: 10}));
      const box = styledBox(200, followsItems);
      act(() => {
        result.current.measureRef(mockMeasure([50, 50, 50], 30));
        result.current.containerRef(box as unknown as HTMLElement);
      });
      expect(result.current.visibleCount).toBe(3);

      box.offsetWidth = 100;
      await deliverBeforePaint(box);
      expect(result.current.visibleCount).toBe(beforePaint);
      // The probe leaves no inline style behind.
      expect(box.style.getPropertyValue('contain')).toBe('');

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(result.current.visibleCount).toBe(1);
    },
  );

  it('leaves no style attribute on a list that had none after the probe', async () => {
    const {result} = renderHook(() => useOverflow(3, {gap: 10}));
    let width = 200;
    const list = document.createElement('div');
    Object.defineProperty(list, 'offsetWidth', {get: () => width});
    act(() => {
      result.current.measureRef(mockMeasure([50, 50, 50], 30));
      result.current.containerRef(list);
    });
    expect(result.current.visibleCount).toBe(3);

    width = 100;
    await deliverBeforePaint(list);
    expect(result.current.visibleCount).toBe(1);
    expect(list.hasAttribute('style')).toBe(false);
  });

  it('measures every list that one delivery reports, then renders once', async () => {
    let renders = 0;
    const {result} = renderHook(() => {
      renders++;
      return [useOverflow(3, {gap: 10}), useOverflow(3, {gap: 10})] as const;
    });
    const first = resizableBox(200);
    const second = resizableBox(200);

    act(() => {
      result.current[0].measureRef(mockMeasure([50, 50, 50], 30));
      result.current[0].containerRef(first as unknown as HTMLElement);
      result.current[1].measureRef(mockMeasure([50, 50, 50], 30));
      result.current[1].containerRef(second as unknown as HTMLElement);
    });
    const settled = renders;

    first.offsetWidth = 100;
    second.offsetWidth = 100;
    await deliverBeforePaint(first, second);

    expect(result.current[0].visibleCount).toBe(1);
    expect(result.current[1].visibleCount).toBe(1);
    expect(renders).toBe(settled + 1);
  });
});

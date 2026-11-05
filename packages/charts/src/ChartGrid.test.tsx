// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartGrid.test.tsx
 * @input Uses vitest, @testing-library/react, Chart, ChartGrid, bar mark
 * @output Functional tests for grid lines — horizontal default, the skipped
 *         y=0 line, vertical lines at band/continuous positions, combined
 *         directions, and safe continuous tick-count handling
 * @position Colocated test for ChartGrid.tsx (issue #4295 viz coverage)
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartGrid} from './ChartGrid';
import {bar} from './marks/bar';

const DATA = [
  {month: 'Jan', sales: 4},
  {month: 'Feb', sales: 10},
  {month: 'Mar', sales: 2},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  act(() => {
    resizeCallback?.(
      [{contentRect: {width}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

function renderGrid(grid: React.ReactNode) {
  const utils = render(
    <Chart data={DATA} xKey="month" series={[bar('sales')]} grid={grid} />,
  );
  reportWidth(600);
  // Marks render paths and the event layer is a rect, so every <line> in the
  // svg belongs to the grid (no axes are mounted in these tests).
  const lines = Array.from(utils.container.querySelectorAll('svg line'));
  return {...utils, lines};
}

describe('ChartGrid', () => {
  it('draws horizontal lines across the plot for every y tick except the y=0 baseline', () => {
    const {lines} = renderGrid(<ChartGrid />);
    // Domain [0, 10] → ticks 0,2,4,6,8,10; the 0 line is skipped → 5 lines.
    expect(lines).toHaveLength(5);
    for (const l of lines) {
      expect(l.getAttribute('x1')).toBe('0');
      expect(l.getAttribute('x2')).toBe('528'); // full plot width
      expect(l.getAttribute('y1')).toBe(l.getAttribute('y2')); // horizontal
      // y=0 maps to the plot bottom (244) — never double-drawn over the axis.
      expect(l.getAttribute('y1')).not.toBe('244');
    }
  });

  it('draws a vertical line at each band center when vertical is enabled', () => {
    const {lines} = renderGrid(<ChartGrid horizontal={false} vertical />);
    expect(lines).toHaveLength(3); // one per category
    for (const l of lines) {
      expect(l.getAttribute('x1')).toBe(l.getAttribute('x2')); // vertical
      expect(l.getAttribute('y1')).toBe('0');
      expect(l.getAttribute('y2')).toBe('244'); // full plot height
    }
    // Band centers are strictly increasing across categories.
    const xs = lines.map(l => Number(l.getAttribute('x1')));
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it('combines horizontal and vertical lines when both are enabled', () => {
    const {lines} = renderGrid(<ChartGrid horizontal vertical />);
    expect(lines).toHaveLength(8); // 5 horizontal + 3 vertical
  });

  it('uses zero to request no continuous grid lines', () => {
    const {lines} = renderGrid(<ChartGrid tickCount={0} />);
    expect(lines).toHaveLength(0);
  });

  it('falls back to the default density for a non-finite tick count', () => {
    const {lines} = renderGrid(
      <ChartGrid tickCount={Number.POSITIVE_INFINITY} />,
    );
    expect(lines).toHaveLength(5);
  });

  it('caps a huge continuous tick request without throwing', () => {
    const {lines} = renderGrid(<ChartGrid tickCount={1e9} />);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(1001);
  });

  it('places vertical lines at d3 tick values on a linear x scale', () => {
    const numeric = [
      {month: 0, sales: 1},
      {month: 5, sales: 7},
      {month: 10, sales: 3},
    ];
    const utils = render(
      <Chart
        data={numeric}
        xKey="month"
        series={[bar('sales')]}
        grid={<ChartGrid horizontal={false} vertical />}
      />,
    );
    reportWidth(600);
    const lines = Array.from(utils.container.querySelectorAll('svg line'));
    // Linear domain [0, 10] → ticks 0,2,4,6,8,10 → 6 evenly spaced lines.
    expect(lines).toHaveLength(6);
    const xs = lines.map(l => Number(l.getAttribute('x1')));
    expect(xs[0]).toBe(0);
    expect(xs[5]).toBe(528);
    expect(xs[1] - xs[0]).toBeCloseTo(528 / 5);
  });
});

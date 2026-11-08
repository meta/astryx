// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartBar.test.tsx
 * @input Renders ChartBar inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for bar marks: rect-per-datum, zero-line growth, band-scale guard (#4295)
 * @position Colocated test for ChartBar.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartBar} from './ChartBar';

const data = [
  {month: 'Jan', revenue: 10},
  {month: 'Feb', revenue: 20},
  {month: 'Mar', revenue: 30},
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

// Scope rect queries to the margin-translated plot group — the chart root
// also renders a clipPath rect inside <defs>.
const PLOT_RECTS = 'svg > g rect';

describe('ChartBar', () => {
  it('renders one bar rect per datum', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartBar dataKey="revenue" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const bars = container.querySelectorAll(PLOT_RECTS);
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar).toHaveAttribute('fill', '#0064E0');
    }
  });

  it('grows bars from the zero line for positive and negative values', () => {
    const posNeg = [
      {month: 'Jan', delta: 10},
      {month: 'Feb', delta: -10},
    ];

    // innerHeight = 300 - 16 (top) - 32 (bottom) = 252. With yDomain
    // [-20, 20] the zero line sits at 126 and ±10 maps to a 63px column.
    const {container} = render(
      <Chart data={posNeg} xKey="month" yKeys={['delta']} yDomain={[-20, 20]}>
        <ChartBar dataKey="delta" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const [up, down] = Array.from(container.querySelectorAll(PLOT_RECTS));
    // Positive bar: top at the value, extends down to the zero line.
    expect(up).toHaveAttribute('y', '63');
    expect(up).toHaveAttribute('height', '63');
    // Negative bar: top at the zero line, extends down to the value.
    expect(down).toHaveAttribute('y', '126');
    expect(down).toHaveAttribute('height', '63');
  });

  it('rounds bar corners with the radius prop', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartBar dataKey="revenue" color="#0064E0" radius={8} />
      </Chart>,
    );

    reportWidth(464);

    const bar = container.querySelector(PLOT_RECTS);
    expect(bar).toHaveAttribute('rx', '8');
    expect(bar).toHaveAttribute('ry', '8');
  });

  it('renders nothing when the x scale is not categorical', () => {
    const numeric = [
      {x: 0, y: 1},
      {x: 1, y: 2},
      {x: 2, y: 3},
    ];

    const {container} = render(
      <Chart data={numeric} xKey="x" yKeys={['y']}>
        <ChartBar dataKey="y" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll(PLOT_RECTS)).toHaveLength(0);
  });
});

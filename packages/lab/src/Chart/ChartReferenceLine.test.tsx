// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartReferenceLine.test.tsx
 * @input Renders ChartReferenceLine inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for reference lines: y line, badge label, x line, band-scale guard (#4295)
 * @position Colocated test for ChartReferenceLine.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartReferenceLine} from './ChartReferenceLine';

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

describe('ChartReferenceLine', () => {
  it('renders a horizontal line across the plot at the y value', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']} yDomain={[0, 100]}>
        <ChartReferenceLine y={50} />
      </Chart>,
    );

    reportWidth(464);

    // y=50 on [0, 100] over the 252px inner height → 126
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('x1', '0');
    expect(lines[0]).toHaveAttribute('x2', '400');
    expect(lines[0]).toHaveAttribute('y1', '126');
    expect(lines[0]).toHaveAttribute('y2', '126');
  });

  it('renders a badge with the label text when label is set', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']} yDomain={[0, 100]}>
        <ChartReferenceLine y={50} label="Target" />
      </Chart>,
    );

    reportWidth(464);

    expect(screen.getByText('Target')).toBeInTheDocument();
    // Badge background behind the label (defs clip rect is outside the plot g)
    expect(container.querySelectorAll('svg > g rect')).toHaveLength(1);
  });

  it('renders a vertical line at the x value on a linear scale', () => {
    const numeric = [
      {x: 0, y: 1},
      {x: 1, y: 2},
      {x: 2, y: 3},
    ];

    const {container} = render(
      <Chart data={numeric} xKey="x" yKeys={['y']} xDomain={[0, 2]}>
        <ChartReferenceLine x={1} />
      </Chart>,
    );

    reportWidth(464);

    // x=1 on [0, 2] over the 400px inner width → 200
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('x1', '200');
    expect(lines[0]).toHaveAttribute('x2', '200');
    expect(lines[0]).toHaveAttribute('y1', '0');
    expect(lines[0]).toHaveAttribute('y2', '252');
  });

  it('renders nothing for an x value on a categorical scale', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartReferenceLine x={1} />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(0);
  });
});

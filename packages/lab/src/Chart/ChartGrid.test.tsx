// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartGrid.test.tsx
 * @input Renders ChartGrid inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for grid lines: horizontal ticks, vertical band centers, off state (#4295)
 * @position Colocated test for ChartGrid.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartGrid} from './ChartGrid';

const data = [
  {month: 'Jan', revenue: 1},
  {month: 'Feb', revenue: 2},
  {month: 'Mar', revenue: 4},
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

describe('ChartGrid', () => {
  it('renders a horizontal line per y tick by default', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']} yDomain={[0, 4]}>
        <ChartGrid />
      </Chart>,
    );

    reportWidth(464);

    // d3 ticks(5) on [0, 4] → 0..4; lines span the 400px inner width.
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(line).toHaveAttribute('x1', '0');
      expect(line).toHaveAttribute('x2', '400');
    }
  });

  it('renders a vertical line per band center when vertical is on', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartGrid horizontal={false} vertical />
      </Chart>,
    );

    reportWidth(464);

    // One line per category, spanning the 252px inner height.
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toHaveAttribute('y1', '0');
      expect(line).toHaveAttribute('y2', '252');
    }
  });

  it('renders no lines when both orientations are off', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartGrid horizontal={false} />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(0);
  });
});

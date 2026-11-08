// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartLegend.test.tsx
 * @input Renders ChartLegend inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for legends: discrete swatches, gradient bar with ticks, empty guard (#4295)
 * @position Colocated test for ChartLegend.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartLegend} from './ChartLegend';

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

describe('ChartLegend', () => {
  it('renders a label per discrete item', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartLegend
          items={[
            {label: 'Revenue', color: '#0064E0'},
            {label: 'Expenses', color: '#E00064'},
          ]}
        />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('foreignObject')).toHaveLength(1);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
  });

  it('renders a gradient bar with evenly spaced domain tick labels', () => {
    render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartLegend
          gradient={['#000000', '#ffffff']}
          domain={[0, 100]}
          label="Temperature"
        />
      </Chart>,
    );

    reportWidth(464);

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    // Default 3 ticks across [0, 100]
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders nothing without items or a gradient', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartLegend />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelector('foreignObject')).toBeNull();
  });
});

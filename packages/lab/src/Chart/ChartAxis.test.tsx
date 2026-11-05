// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartAxis.test.tsx
 * @input Renders ChartAxis inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for axes: band ticks, numeric ticks, maxTicks skip, truncation (#4295)
 * @position Colocated test for ChartAxis.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartAxis} from './ChartAxis';

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

function labelsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('text')).map(
    t => t.textContent ?? '',
  );
}

describe('ChartAxis', () => {
  it('renders one tick label per category on the bottom band axis', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartAxis position="bottom" />
      </Chart>,
    );

    reportWidth(464);

    expect(labelsOf(container)).toEqual(['Jan', 'Feb', 'Mar']);
    // One axis line plus one tick line per category.
    expect(container.querySelectorAll('line')).toHaveLength(4);
  });

  it('renders numeric tick labels on the left axis', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']} yDomain={[0, 4]}>
        <ChartAxis position="left" />
      </Chart>,
    );

    reportWidth(464);

    // d3 ticks(5) on an explicit [0, 4] domain
    expect(labelsOf(container)).toEqual(['0', '1', '2', '3', '4']);
    expect(container.querySelectorAll('line')).toHaveLength(6);
  });

  it('skips labels evenly when maxTicks is exceeded', () => {
    const wide = ['A', 'B', 'C', 'D', 'E'].map(cat => ({cat, value: 1}));

    const {container} = render(
      <Chart data={wide} xKey="cat" yKeys={['value']}>
        <ChartAxis position="bottom" maxTicks={3} />
      </Chart>,
    );

    reportWidth(464);

    // ceil(5 / 3) = 2 → every second category
    expect(labelsOf(container)).toEqual(['A', 'C', 'E']);
  });

  it('truncates long labels with an ellipsis', () => {
    const long = [{month: 'January', revenue: 10}];

    const {container} = render(
      <Chart data={long} xKey="month" yKeys={['revenue']}>
        <ChartAxis position="bottom" truncate={3} />
      </Chart>,
    );

    reportWidth(464);

    expect(labelsOf(container)).toEqual(['Jan…']);
  });
});

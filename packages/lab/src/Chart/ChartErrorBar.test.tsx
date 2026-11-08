// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartErrorBar.test.tsx
 * @input Renders ChartErrorBar inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for error bars: stem and caps per datum, bound-to-bound span (#4295)
 * @position Colocated test for ChartErrorBar.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartErrorBar} from './ChartErrorBar';

const data = [
  {month: 'Jan', upper: 30, lower: 10},
  {month: 'Feb', upper: 40, lower: 20},
  {month: 'Mar', upper: 50, lower: 30},
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

describe('ChartErrorBar', () => {
  it('renders a stem and two whisker caps per datum', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['upper', 'lower']}>
        <ChartErrorBar yUpper="upper" yLower="lower" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(9);
  });

  it('spans the stem from the lower to the upper bound', () => {
    const single = [{month: 'Jan', upper: 75, lower: 25}];

    const {container} = render(
      <Chart
        data={single}
        xKey="month"
        yKeys={['upper', 'lower']}
        yDomain={[0, 100]}>
        <ChartErrorBar yUpper="upper" yLower="lower" />
      </Chart>,
    );

    reportWidth(464);

    // On [0, 100] over the 252px inner height: 75 → 63, 25 → 189.
    const [stem, capTop, capBottom] = Array.from(
      container.querySelectorAll('line'),
    );
    expect(stem).toHaveAttribute('y1', '63');
    expect(stem).toHaveAttribute('y2', '189');
    expect(capTop).toHaveAttribute('y1', '63');
    expect(capTop).toHaveAttribute('y2', '63');
    expect(capBottom).toHaveAttribute('y1', '189');
    expect(capBottom).toHaveAttribute('y2', '189');
  });
});

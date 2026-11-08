// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartDot.test.tsx
 * @input Renders ChartDot inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for scatter dots: circle-per-datum, linear-scale positions (#4295)
 * @position Colocated test for ChartDot.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartDot} from './ChartDot';

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

describe('ChartDot', () => {
  it('renders one circle per datum with the default radius', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartDot dataKey="revenue" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    for (const circle of circles) {
      expect(circle).toHaveAttribute('r', '4');
      expect(circle).toHaveAttribute('fill', '#0064E0');
    }
  });

  it('positions dots through the linear scales for numeric data', () => {
    const numeric = [
      {x: 0, y: 0},
      {x: 1, y: 5},
      {x: 2, y: 10},
    ];

    // Width 464 - margins (48 + 16) = 400 inner width; height 300 - (16 + 32)
    // = 252 inner height. Explicit domains make the mapping exact.
    const {container} = render(
      <Chart
        data={numeric}
        xKey="x"
        yKeys={['y']}
        xDomain={[0, 2]}
        yDomain={[0, 10]}>
        <ChartDot dataKey="y" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const circles = Array.from(container.querySelectorAll('circle'));
    expect(circles.map(c => c.getAttribute('cx'))).toEqual(['0', '200', '400']);
    expect(circles.map(c => c.getAttribute('cy'))).toEqual(['252', '126', '0']);
  });
});

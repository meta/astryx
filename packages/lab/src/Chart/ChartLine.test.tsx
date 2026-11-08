// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartLine.test.tsx
 * @input Renders ChartLine inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for line marks: single path, optional dots, stroke props (#4295)
 * @position Colocated test for ChartLine.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartLine} from './ChartLine';

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

describe('ChartLine', () => {
  it('renders a single stroked path through the data and no dots by default', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartLine dataKey="revenue" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute('d')).toMatch(/^M/);
    expect(paths[0]).toHaveAttribute('fill', 'none');
    expect(paths[0]).toHaveAttribute('stroke', '#0064E0');
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('marks each datum with a dot when dots is set', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartLine dataKey="revenue" color="#0064E0" dots />
      </Chart>,
    );

    reportWidth(464);

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    for (const circle of circles) {
      // Default dotRadius
      expect(circle).toHaveAttribute('r', '3');
      expect(circle).toHaveAttribute('fill', '#0064E0');
    }
  });

  it('applies the strokeWidth prop to the line', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartLine dataKey="revenue" color="#0064E0" strokeWidth={5} />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelector('path')).toHaveAttribute(
      'stroke-width',
      '5',
    );
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartArea.test.tsx
 * @input Renders ChartArea inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for area bands: fill path, edge stroke, baseline fallback, empty guard (#4295)
 * @position Colocated test for ChartArea.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartArea} from './ChartArea';

const data = [
  {month: 'Jan', upper: 30, lower: 10, mean: 20},
  {month: 'Feb', upper: 40, lower: 20, mean: 30},
  {month: 'Mar', upper: 50, lower: 30, mean: 40},
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

describe('ChartArea', () => {
  it('renders a single filled band between yUpper and yLower', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['upper', 'lower']}>
        <ChartArea yUpper="upper" yLower="lower" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute('d')).toMatch(/^M/);
    expect(paths[0]).toHaveAttribute('fill', '#0064E0');
    // Default opacity
    expect(paths[0]).toHaveAttribute('fill-opacity', '0.2');
  });

  it('adds an edge stroke path when stroke is set', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['upper', 'lower']}>
        <ChartArea yUpper="upper" yLower="lower" color="#0064E0" stroke />
      </Chart>,
    );

    reportWidth(464);

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[1]).toHaveAttribute('fill', 'none');
    expect(paths[1]).toHaveAttribute('stroke', '#0064E0');
  });

  it('falls back to the baseline key for the missing bound', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['upper', 'mean']}>
        <ChartArea yUpper="upper" baseline="mean" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('renders nothing when no bound keys are given', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['upper']}>
        <ChartArea color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});

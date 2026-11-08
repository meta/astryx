// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartSelect.test.tsx
 * @input Renders ChartSelect inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for selection: capture surface, controlled selection rings,
 *   out-of-range guard. Tap gestures need createSVGPoint/getScreenCTM, which do not
 *   exist in jsdom, so they are intentionally out of scope here. (#4295)
 * @position Colocated test for ChartSelect.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartSelect} from './ChartSelect';

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

describe('ChartSelect', () => {
  it('renders a full-plot tap capture surface and no rings by default', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartSelect />
      </Chart>,
    );

    reportWidth(464);

    const surface = container.querySelector('svg > g rect');
    expect(surface).not.toBeNull();
    expect(surface).toHaveAttribute('width', '400');
    expect(surface).toHaveAttribute('height', '252');
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('rings each controlled selected data point', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartSelect selected={[0, 2]} color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const rings = container.querySelectorAll('circle');
    expect(rings).toHaveLength(2);
    for (const ring of rings) {
      expect(ring).toHaveAttribute('fill', 'none');
      expect(ring).toHaveAttribute('stroke', '#0064E0');
      // Default radius
      expect(ring).toHaveAttribute('r', '6');
    }
  });

  it('ignores out-of-range selection indices', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartSelect selected={[-1, 5]} />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });
});

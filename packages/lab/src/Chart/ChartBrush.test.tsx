// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartBrush.test.tsx
 * @input Renders ChartBrush inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for the brush's idle state. Drag gestures need
 *   createSVGPoint/getScreenCTM, which do not exist in jsdom, so they are
 *   intentionally out of scope here. (#4295)
 * @position Colocated test for ChartBrush.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartBrush} from './ChartBrush';

const data = [
  {x: 0, y: 1},
  {x: 1, y: 2},
  {x: 2, y: 3},
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

describe('ChartBrush', () => {
  it('renders a full-plot drag capture surface', () => {
    const {container} = render(
      <Chart data={data} xKey="x" yKeys={['y']}>
        <ChartBrush />
      </Chart>,
    );

    reportWidth(464);

    const surface = container.querySelector('svg > g rect');
    expect(surface).not.toBeNull();
    expect(surface).toHaveAttribute('width', '400');
    expect(surface).toHaveAttribute('height', '252');
    expect(surface).toHaveAttribute('fill', 'transparent');
  });

  it('shows no selection rectangle before any drag', () => {
    const {container} = render(
      <Chart data={data} xKey="x" yKeys={['y']}>
        <ChartBrush mode="xy" />
      </Chart>,
    );

    reportWidth(464);

    // Only the capture surface — no highlight overlay.
    expect(container.querySelectorAll('svg > g rect')).toHaveLength(1);
  });
});

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartTooltip.test.tsx
 * @input Renders ChartTooltip inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for the tooltip's idle state: capture surface, no crosshair, no card.
 *   The pointer pipeline (createSVGPoint/getScreenCTM) does not exist in jsdom, so hover
 *   states are intentionally out of scope here. (#4295)
 * @position Colocated test for ChartTooltip.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartTooltip} from './ChartTooltip';

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

describe('ChartTooltip', () => {
  it('renders a full-plot pointer capture surface', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartTooltip />
      </Chart>,
    );

    reportWidth(464);

    // Inner plot area: 464 - (48 + 16) wide, 300 - (16 + 32) tall.
    const surface = container.querySelector('svg > g rect');
    expect(surface).not.toBeNull();
    expect(surface).toHaveAttribute('width', '400');
    expect(surface).toHaveAttribute('height', '252');
    expect(surface).toHaveAttribute('fill', 'transparent');
  });

  it('shows no crosshair or point indicator before pointer interaction', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartTooltip crosshair="xy" crosshairLabels />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('shows no tooltip content before pointer interaction', () => {
    render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <ChartTooltip />
      </Chart>,
    );

    reportWidth(464);
    // A second measurement re-renders with the svg ref resolved, giving the
    // portal every chance to mount — content must still be absent.
    reportWidth(465);

    // The default renderer would print "month: Jan" lines for the datum.
    // Chart also renders a visually hidden data table (#4382) whose row and
    // column headers legitimately read "Jan" and "revenue", so only text
    // outside that table counts as tooltip content.
    const outsideTable = (el: HTMLElement) => el.closest('table') == null;
    expect(screen.queryAllByText(/Jan/).filter(outsideTable)).toHaveLength(0);
    expect(screen.queryAllByText(/revenue/).filter(outsideTable)).toHaveLength(
      0,
    );
  });
});

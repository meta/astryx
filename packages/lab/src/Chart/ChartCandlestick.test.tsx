// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartCandlestick.test.tsx
 * @input Renders ChartCandlestick inside Chart with a stubbed ResizeObserver
 * @output Render-smoke coverage for candlesticks: default public data variables,
 *   explicit up/down colors, variants, and the band guard (#4295)
 * @position Colocated test for ChartCandlestick.tsx
 */

import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartCandlestick} from './ChartCandlestick';

const ohlc = [
  {day: 'Mon', high: 90, low: 10, open: 30, close: 70}, // up
  {day: 'Tue', high: 80, low: 20, open: 60, close: 40}, // down
  {day: 'Wed', high: 95, low: 5, open: 50, close: 50}, // flat counts as up
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

// Scope rect queries to the margin-translated plot group — the chart root
// also renders a clipPath rect inside <defs>.
const PLOT_RECTS = 'svg > g rect';

describe('ChartCandlestick', () => {
  it('renders two whiskers and a body rect per datum in the default variant', () => {
    const {container} = render(
      <Chart data={ohlc} xKey="day" yKeys={['high', 'low']}>
        <ChartCandlestick high="high" low="low" open="open" close="close" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(6);
    expect(container.querySelectorAll(PLOT_RECTS)).toHaveLength(3);
  });

  it('uses public data variables for default up and down colors', () => {
    const {container} = render(
      <Chart data={ohlc} xKey="day" yKeys={['high', 'low']}>
        <ChartCandlestick high="high" low="low" open="open" close="close" />
      </Chart>,
    );

    reportWidth(464);

    const bodies = Array.from(container.querySelectorAll(PLOT_RECTS));
    expect(bodies.map(body => body.getAttribute('fill'))).toEqual([
      dataVars['--color-data-categorical-green'],
      dataVars['--color-data-categorical-red'],
      dataVars['--color-data-categorical-green'],
    ]);
    expect(container.querySelector('line')).toHaveAttribute(
      'stroke',
      dataVars['--color-data-categorical-green'],
    );
  });

  it('renders a range line and open/close ticks per datum in the bar variant', () => {
    const {container} = render(
      <Chart data={ohlc} xKey="day" yKeys={['high', 'low']}>
        <ChartCandlestick
          variant="bar"
          high="high"
          low="low"
          open="open"
          close="close"
        />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(9);
    expect(container.querySelectorAll(PLOT_RECTS)).toHaveLength(0);
  });

  it('colors rising and falling candles with upColor and downColor', () => {
    const {container} = render(
      <Chart data={ohlc} xKey="day" yKeys={['high', 'low']}>
        <ChartCandlestick
          high="high"
          low="low"
          open="open"
          close="close"
          upColor="#00aa00"
          downColor="#cc0000"
        />
      </Chart>,
    );

    reportWidth(464);

    const bodies = Array.from(container.querySelectorAll(PLOT_RECTS));
    expect(bodies.map(b => b.getAttribute('fill'))).toEqual([
      '#00aa00', // close > open
      '#cc0000', // close < open
      '#00aa00', // close === open counts as up
    ]);
  });

  it('renders nothing when the x scale is not categorical', () => {
    const numeric = [{t: 0, high: 90, low: 10, open: 30, close: 70}];

    const {container} = render(
      <Chart data={numeric} xKey="t" yKeys={['high', 'low']}>
        <ChartCandlestick high="high" low="low" open="open" close="close" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.querySelectorAll(PLOT_RECTS)).toHaveLength(0);
  });
});
